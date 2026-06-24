use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::Manager;
use tauri::menu::{MenuBuilder, SubmenuBuilder, MenuItemBuilder, PredefinedMenuItem};
use tauri::Emitter;

struct EngineProcess(Mutex<Option<Child>>);

#[tauri::command]
fn engine_call(state: tauri::State<EngineProcess>, method: String, params: String) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;

    if guard.is_none() {
        let child = Command::new("python3")
            .arg("-c")
            .arg("from engine import main; main()")
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

        let mut reader = BufReader::new(child.stdout.as_mut().ok_or("Stdout not available")?);
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
    if let Ok(cwd) = std::env::current_dir() {
        let dev_path = cwd.parent().map(|p| p.join("engine"));
        if let Some(path) = dev_path {
            if path.exists() {
                return path.to_string_lossy().to_string();
            }
        }
    }
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

            // ── Build menu bar ──────────────────────────────────────
            let generate_dbt = MenuItemBuilder::with_id("generate_dbt", "Generate dbt Project")
                .accelerator("CmdOrCtrl+Shift+G")
                .build(app)?;

            let run_analysis = MenuItemBuilder::with_id("run_analysis", "Run Schema Analysis")
                .accelerator("CmdOrCtrl+Shift+A")
                .build(app)?;

            let add_connection = MenuItemBuilder::with_id("add_connection", "Add Connection...")
                .accelerator("CmdOrCtrl+Shift+N")
                .build(app)?;

            let project_menu = SubmenuBuilder::new(app, "Project")
                .items(&[&add_connection, &run_analysis, &generate_dbt])
                .build()?;

            let settings_item = MenuItemBuilder::with_id("settings", "Settings...")
                .accelerator("CmdOrCtrl+,")
                .build(app)?;

            let separator = PredefinedMenuItem::separator(app)?;

            let file_menu = SubmenuBuilder::new(app, "File")
                .items(&[&settings_item, &separator, &PredefinedMenuItem::close_window(app, None)?])
                .build()?;

            let help_menu = SubmenuBuilder::new(app, "Help")
                .item(&MenuItemBuilder::with_id("about", "About DataForge").build(app)?)
                .build()?;

            let menu = MenuBuilder::new(app)
                .items(&[&file_menu, &project_menu, &help_menu])
                .build()?;

            app.set_menu(menu)?;

            Ok(())
        })
        .on_menu_event(|app, event| {
            let id = event.id().0.as_str();
            match id {
                "generate_dbt" => {
                    let _ = app.emit("menu-action", serde_json::json!({"action": "generate_dbt"}));
                }
                "run_analysis" => {
                    let _ = app.emit("menu-action", serde_json::json!({"action": "run_analysis"}));
                }
                "add_connection" => {
                    let _ = app.emit("menu-action", serde_json::json!({"action": "add_connection"}));
                }
                "settings" => {
                    let _ = app.emit("menu-action", serde_json::json!({"action": "settings"}));
                }
                "about" => {
                    let _ = app.emit("menu-action", serde_json::json!({"action": "about"}));
                }
                _ => {}
            }
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let state: tauri::State<EngineProcess> = window.state::<EngineProcess>();
                let mut guard = match state.0.lock() {
                    Ok(g) => g,
                    Err(_) => return,
                };
                if let Some(ref mut child) = *guard {
                    let _ = child.kill();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
