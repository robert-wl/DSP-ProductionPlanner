# Convenience wrappers around the npm scripts.
#
#   make start     install if needed, then run the dev server
#   make build     production build into dist/
#   make preview   serve that build
#   make data      regenerate public/data/game.json and public/icons/
#   make test      the worker's differential and unit suites

.PHONY: start install build preview data test clean

node_modules: package.json
	npm install
	@touch node_modules

install: node_modules

start: node_modules
	npm run dev

build: node_modules
	npm run build

preview: build
	npm run preview

data: node_modules
	npm run build-data

test: node_modules
	npm test

clean:
	rm -rf dist
