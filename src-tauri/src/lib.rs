use serde::Serialize;
use std::{
  io::{Read, Write},
  net::TcpListener,
  process::Command,
  sync::{Arc, Mutex},
  thread,
  time::{Duration, Instant},
};

#[derive(Clone, Default)]
struct SpotifyAuthState {
  code: Arc<Mutex<Option<String>>>,
  error: Arc<Mutex<Option<String>>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AuthServerResponse {
  redirect_uri: String,
}

#[derive(Serialize)]
struct AuthPollResponse {
  code: Option<String>,
  error: Option<String>,
}

#[tauri::command]
fn start_spotify_auth_server(state: tauri::State<SpotifyAuthState>) -> Result<AuthServerResponse, String> {
  if let Ok(mut code) = state.code.lock() {
    *code = None;
  }
  if let Ok(mut error) = state.error.lock() {
    *error = None;
  }

  let listener = TcpListener::bind("127.0.0.1:0").map_err(|err| format!("Failed to bind Spotify auth callback server: {err}"))?;
  let address = listener
    .local_addr()
    .map_err(|err| format!("Failed to resolve Spotify auth callback server: {err}"))?;

  let code_state = state.code.clone();
  let error_state = state.error.clone();

  thread::spawn(move || {
    let _ = listener.set_nonblocking(true);
    let started_at = Instant::now();

    while started_at.elapsed() < Duration::from_secs(180) {
      match listener.accept() {
        Ok((mut stream, _)) => {
          let mut buffer = [0_u8; 4096];
          let read_len: usize = stream.read(&mut buffer).unwrap_or_default();
          let request = String::from_utf8_lossy(&buffer[..read_len]);
          let request_line = request.lines().next().unwrap_or_default();
          let request_path = request_line.split_whitespace().nth(1).unwrap_or("/");
          let parsed = url::Url::parse(&format!("http://127.0.0.1{request_path}")).ok();

          let code = parsed.as_ref().and_then(|parsed_url| {
            parsed_url
              .query_pairs()
              .find(|(key, _)| key == "code")
              .map(|(_, value)| value.to_string())
          });
          let error = parsed.as_ref().and_then(|parsed_url| {
            parsed_url
              .query_pairs()
              .find(|(key, _)| key == "error")
              .map(|(_, value)| value.to_string())
          });

          if let Some(code) = code {
            if let Ok(mut shared_code) = code_state.lock() {
              *shared_code = Some(code);
            }
          }

          if let Some(error) = error {
            if let Ok(mut shared_error) = error_state.lock() {
              *shared_error = Some(error);
            }
          }

          let body = r#"<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>TrueShuffle Connected</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #05070a;
        color: #f5f7f8;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif;
      }
      .card {
        width: min(460px, calc(100vw - 48px));
        padding: 28px;
        border-radius: 24px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.04);
        box-shadow: 0 20px 60px rgba(0,0,0,0.45);
        text-align: center;
      }
      h1 { margin: 0 0 10px; font-size: 28px; }
      p { margin: 0; color: rgba(245,247,248,0.72); line-height: 1.5; }
      strong { color: #4ade80; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>TrueShuffle connected</h1>
      <p>You can close this browser tab and return to <strong>TrueShuffle</strong>.</p>
    </div>
  </body>
</html>"#;

          let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
          );
          let _ = stream.write_all(response.as_bytes());
          let _ = stream.flush();
          break;
        }
        Err(_) => thread::sleep(Duration::from_millis(120)),
      }
    }
  });

  Ok(AuthServerResponse {
    redirect_uri: format!("http://127.0.0.1:{}/callback", address.port()),
  })
}

#[tauri::command]
fn poll_spotify_auth_result(state: tauri::State<SpotifyAuthState>) -> Result<AuthPollResponse, String> {
  let code = state
    .code
    .lock()
    .map_err(|_| "Failed to read Spotify auth code".to_string())?
    .take();
  let error = state
    .error
    .lock()
    .map_err(|_| "Failed to read Spotify auth error".to_string())?
    .take();

  Ok(AuthPollResponse { code, error })
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
  #[cfg(target_os = "macos")]
  {
    Command::new("open")
      .arg(url)
      .spawn()
      .map_err(|err| format!("Failed to open system browser: {err}"))?;
    return Ok(());
  }

  #[allow(unreachable_code)]
  Err("Desktop browser auth is only configured for macOS right now.".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(SpotifyAuthState::default())
    .invoke_handler(tauri::generate_handler![
      start_spotify_auth_server,
      poll_spotify_auth_result,
      open_external_url
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
