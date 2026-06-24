use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

struct EngineProcess(Mutex<Option<Child>>);

#[tauri::command]
fn engine_call(state: tauri::State<EngineProcess>, method: String, params: String) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;

    if guard.is_none() {
        // Start the Python engine process
        let child = Command::new("python3")
            .arg("-m")
            .arg("engine.main")
            .current_dir(find_engine_dir())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start engine: {}", e))?;
        *guard = Some(child);
    }

    if let Some(ref mut child) = *guard {
        let stdin = child.stdin.as_mut().ok_or("Stdin not available")?;
        let request = serde_json::json!({"method": method, "params": serde_json::from_str::<serde_json::Value>(&params).unwrap_or_default()});
        let line = serde_json::to_string(&request).map_err(|e| e.to_string())?;

        stdin
            .write_all(format!("{}\n", line).as_bytes())
            .map_err(|e| e.to_string())?;
        stdin.flush().map_err(|e| e.to_string())?;

        let reader = BufReader::new(child.stdout.as_mut().ok_or("Stdout not available")?);
        let mut response = String::new();
        reader
            .read_line(&mut response)
            .map_err(|e| format!("Engine read error: {}", e))?;

        Ok(response.trim().to_string())
    } else {
        Err("Engine not available".to_string())
    }
}

fn find_engine_dir() -> String {
    // In development, engine is at ../engine from src-tauri
    if let Ok(cwd) = std::env::current_dir() {
        let dev_path = cwd.parent().map(|p| p.join("engine"));
        if let Some(path) = dev_path {
            if path.exists() {
                return path.to_string_lossy().to_string();
            }
        }
    }
    // Fallback: check relative to executable
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let bundle_path = parent.join("engine");
            if bundle_path.exists() {
                return bundle_path.to_string_lossy().to_string();
            }
        }
    }
    ".".to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(EngineProcess(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![engine_call])
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
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // Kill engine on close
                if let Some(state) = window.try_state::<EngineProcess>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(ref mut child) = *guard {
                            let _ = child.kill();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
