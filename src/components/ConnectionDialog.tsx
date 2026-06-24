import { useState, useEffect } from "react";
import "./ConnectionDialog.css";

interface Props {
  open: boolean;
  onClose: () => void;
  onConnected: (name: string, dsn: string) => void;
}

const PRESETS = [
  { label: "pg-crm (PostgreSQL)", dsn: "postgresql://postgres:postgres@localhost:5433/crm_db" },
  { label: "orders-db (MySQL)", dsn: "mysql+pymysql://root:***@localhost:3307/orders" },
];

function ConnectionDialog({ open, onClose, onConnected }: Props) {
  const [dsn, setDsn] = useState("");
  const [name, setName] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (open) {
      setDsn("");
      setName("");
      setTestResult(null);
    }
  }, [open]);

  async function handleTest() {
    if (!dsn.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await (window as any).__TAURI_INTERNALS__.invoke("engine_call", {
        method: "connect",
        params: JSON.stringify({ dsn: dsn.trim(), name: name.trim() || "default" }),
      });
      const data = JSON.parse(res);
      if (data.result?.connected) {
        setTestResult({ ok: true, msg: "Connected successfully" });
      } else {
        setTestResult({ ok: false, msg: data.result?.error || "Connection failed" });
      }
    } catch (e: any) {
      setTestResult({ ok: false, msg: String(e) });
    } finally {
      setTesting(false);
    }
  }

  async function handleConnect() {
    if (!dsn.trim()) return;
    // First test, then close
    await handleTest();
    onConnected(name.trim() || "default", dsn.trim());
    onClose();
  }

  function applyPreset(preset: { label: string; dsn: string }) {
    setDsn(preset.dsn);
    setName(preset.label.split(" ")[0]);
    setTestResult(null);
  }

  if (!open) return null;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-modal" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>Add Connection</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="dialog-body">
          <section>
            <h3>Presets</h3>
            <div className="preset-list">
              {PRESETS.map((p) => (
                <button key={p.label} className="preset-btn" onClick={() => applyPreset(p)}>
                  {p.label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3>Connection String</h3>
            <label>
              Name
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="default"
              />
            </label>
            <label>
              DSN
              <input
                type="text"
                value={dsn}
                onChange={(e) => setDsn(e.target.value)}
                placeholder="postgresql://user:pass@host:port/db"
              />
            </label>
            <span className="hint">
              Supported: PostgreSQL, MySQL, DuckDB, SQLite, Snowflake
            </span>
          </section>

          {testResult && (
            <div className={`test-result ${testResult.ok ? "ok" : "fail"}`}>
              {testResult.ok ? "✓ " : "✗ "}{testResult.msg}
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={handleTest} disabled={!dsn.trim() || testing}>
            {testing ? "Testing..." : "Test Connection"}
          </button>
          <button className="btn btn-primary" onClick={handleConnect} disabled={!dsn.trim() || testing}>
            Connect
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConnectionDialog;
