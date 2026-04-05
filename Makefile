NODE := $(HOME)/.nvm/versions/node/v22.22.2/bin/node
NPM  := PATH="$(HOME)/.nvm/versions/node/v22.22.2/bin:$(PATH)" $(HOME)/.nvm/versions/node/v22.22.2/bin/npm

.PHONY: build start lint

build:
	$(NPM) run build
	@cp .scaffold/build/*.xpi ../releases/ 2>/dev/null && echo "→ .xpi archived to releases/" || true

start:
	$(NPM) run start

lint:
	$(NPM) run lint:fix
