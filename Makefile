NODE := $(HOME)/.nvm/versions/node/v22.22.2/bin/node
NPM  := PATH="$(HOME)/.nvm/versions/node/v22.22.2/bin:$(PATH)" $(HOME)/.nvm/versions/node/v22.22.2/bin/npm

.PHONY: build start lint hooks

build:
	$(NPM) run build
	@cp .scaffold/build/*.xpi ../releases/ 2>/dev/null && echo "→ .xpi archived to releases/" || true

start:
	$(NPM) run start

lint:
	$(NPM) run lint:fix

# 安装 pre-commit 密钥扫描 hook（防误提交 API key / token）
hooks:
	@mkdir -p scripts
	@ln -sf ../../scripts/pre-commit .git/hooks/pre-commit
	@chmod +x scripts/pre-commit .git/hooks/pre-commit
	@echo "→ pre-commit hook 已安装（scripts/pre-commit → .git/hooks/pre-commit）"
