import { useState, useEffect } from "react";
import "./Settings.css";

interface LLMConfig {
  llm_provider: string;
  llm_model: string;
  llm_api_key: string;
  llm_api_base: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

function Settings({ open, onClose }: Props) {
  const [config, setConfig] = useState<LLMConfig>({
    llm_provider: "deepseek",
    llm_model: "deepseek-chat",
    llm_api_key: "",
    llm_api_base: "https://api.deepseek.com",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open) {
      loadConfig();
    }
  }, [open]);

  async function loadConfig() {
    try {
      const res = await (window as any).__TAURI_INTERNALS__.invoke("engine_call", {
        method: "config",
        params: "{}",
      });
      const data = JSON.parse(res);
      if (data.result) {
        setConfig(data.result);
      }
    } catch (e) {
      console.error("Failed to load config", e);
    }
  }

  async function saveConfig() {
    setSaving(true);
    try {
      for (const [key, value] of Object.entries(config)) {
        await (window as any).__TAURI_INTERNALS__.invoke("engine_call", {
          method: "config",
          params: JSON.stringify({ key, value }),
        });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error("Failed to save config", e);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="settings-body">
          <section>
            <h3>LLM Configuration</h3>
            <p className="desc">Configure the AI model used for schema analysis and dbt generation.</p>

            <label>
              Provider
              <select
                value={config.llm_provider}
                onChange={(e) => setConfig({ ...config, llm_provider: e.target.value })}
              >
                <option value="deepseek">DeepSeek</option>
                <option value="openai">OpenAI</option>
                <option value="custom">Custom (OpenAI-compatible)</option>
              </select>
            </label>

            <label>
              Model Name
              <input
                type="text"
                value={config.llm_model}
                onChange={(e) => setConfig({ ...config, llm_model: e.target.value })}
                placeholder="deepseek-chat / gpt-4o / etc."
              />
            </label>

            <label>
              API Key
              <input
                type="password"
                value={config.llm_api_key}
                onChange={(e) => setConfig({ ...config, llm_api_key: e.target.value })}
                placeholder="sk-..."
              />
            </label>

            <label>
              API Base URL
              <input
                type="text"
                value={config.llm_api_base}
                onChange={(e) => setConfig({ ...config, llm_api_base: e.target.value })}
                placeholder="https://api.deepseek.com"
              />
            </label>
          </section>
        </div>

        <div className="settings-footer">
          <span className="hint">Config saved to ~/.dataforge/config.json</span>
          <div className="footer-actions">
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={saveConfig} disabled={saving}>
              {saving ? "Saving..." : saved ? "✓ Saved" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Settings;
