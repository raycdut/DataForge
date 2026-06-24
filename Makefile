.PHONY: install dev build engine-setup

install: engine-setup
	npm install

engine-setup:
	cd engine && python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"

dev:
	npx tauri dev

build:
	npx tauri build
