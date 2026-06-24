# DataForge — AI-Powered Data Modeling IDE

**Connect → Analyze → Model → Generate dbt**

DataForge is a desktop IDE for data engineers and analysts. It connects to your database, automatically discovers schema and relationships, uses AI to suggest data models, generates ready-to-run dbt projects.

## Architecture

```
Frontend (React + TypeScript + React Flow)
       │ IPC (Tauri commands)
Tauri (Rust) ─── manages shell command
       │ stdio (JSON protocol)
Python Engine (schema analysis, LLM, dbt generation)
```

## Getting Started

```bash
# Install Python engine
cd engine
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

# Install frontend
cd ..
npm install

# Run in dev mode
npx tauri dev
```
