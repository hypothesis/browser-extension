SETTINGS_FILE := settings/chrome-dev.json

BROWSERIFY := node_modules/.bin/browserify
ESLINT := node_modules/.bin/eslint
EXORCIST := node_modules/.bin/exorcist
MUSTACHE := node_modules/.bin/mustache
PRETTIER := node_modules/.bin/prettier

.PHONY: default
default: help

.PHONY: help
help:
	@echo "make help              Show this help message"
	@echo "make dev               Watch for changes and build the browser-extension"
	@echo "make build             Create a build of the browser-extension"
	@echo "make lint              Run the code linter(s) and print any warnings"
	@echo "make checkformatting   Check code formatting"
	@echo "make format            Automatically format code"
	@echo "make test              Run the unit tests once"
	@echo "make sure              Make sure that the formatter, linter, tests, etc all pass"
	@echo "make clean             Delete development artefacts (cached files, "
	@echo "                       dependencies, etc)"

.PHONY: build
build: node_modules/.uptodate extension

.PHONY: dev
dev: node_modules/.uptodate
	yarn gulp watch

.PHONY: clean
clean:
	rm -f node_modules/.uptodate
	rm -rf build/* build/.settings.json build/.*.deps
	rm -rf dist/*

################################################################################

# We write the settings found in SETTINGS_FILE to build/.settings.json (when the
# contents change) in order to ensure that a different SETTINGS_FILE results in
# the appropriate things being rebuilt.
.PHONY: force
build/.settings.json: force
	@tools/settings.js $(SETTINGS_FILE) | \
	cmp -s - $@ || \
	tools/settings.js $(SETTINGS_FILE) >$@

EXTENSION_SRC := pdfjs help images options

.PHONY: extension
extension: build/extension.bundle.js
extension: build/manifest.json
extension: build/client/build
extension: build/client/app.html
extension: build/client/notebook.html
extension: build/settings-data.js
extension: build/unload-client.js
extension: build/pdfjs-init.js
extension: build/pdfjs-setup-env.js
extension: build/pdfjs-worker-init.js
extension: $(addprefix build/,$(EXTENSION_SRC))

build/extension.bundle.js: src/background/index.js
	$(BROWSERIFY) -t babelify -d $< > $@.tmp
	cat $@.tmp | $(EXORCIST) $(addsuffix .map,$@) >$@
	@# When building the extension bundle, we also write out a list of
	@# depended-upon files to .extension.bundle.deps, which we then include to
	@# ensure that the bundle is rebuilt if any of these change. We ignore
	@# vendor dependencies.
	@$(BROWSERIFY) -t babelify --list $< | \
		grep -v node_modules | \
		sed 's#^#$@: #' \
		>build/.extension.bundle.deps
build/manifest.json: src/manifest.json.mustache build/.settings.json
	$(MUSTACHE) build/.settings.json $< > $@
build/client/build: node_modules/hypothesis/build/manifest.json
	@mkdir -p $@
	cp -R node_modules/hypothesis/build/* $@
	@# We can't leave the client manifest in the build or the Chrome Web Store
	@# will complain.
	rm $@/manifest.json
build/client/app.html: src/sidebar-app.html.mustache build/client build/.settings.json
	tools/template-context-app.js build/.settings.json | $(MUSTACHE) - $< >$@
build/client/notebook.html: build/client/app.html
	cp $< $@
build/settings-data.js: src/settings-data.js.mustache build/client build/.settings.json
	tools/template-context-settings.js build/.settings.json | $(MUSTACHE) - $< >$@
build/unload-client.js: src/unload-client.js
	cp $< $@
build/pdfjs-init.js: src/pdfjs-init.js
	cp $< $@
build/pdfjs-setup-env.js: src/pdfjs-setup-env.js
	cp $< $@
build/pdfjs-worker-init.js: src/pdfjs-worker-init.js
	cp $< $@
build/pdfjs: src/vendor/pdfjs
	cp -R $< $@
build/%: src/%
	@mkdir -p $@
	cp -R $</* $@

dist/%.zip dist/%.xpi: extension
	cd build && find . -not -path '*/\.*' -type f | zip -q -@ $(abspath $@)

.PHONY: lint
lint:
	$(ESLINT) .
	yarn typecheck

.PHONY: checkformatting
checkformatting:
	$(PRETTIER) --check 'src/**/*.js' 'tests/**/*.js'

.PHONY: format
format:
	$(PRETTIER) --list-different --write 'src/**/*.js' 'tests/**/*.js'

.PHONY: test
test:
	yarn test

.PHONY: sure
sure: checkformatting lint test

node_modules/.uptodate: package.json yarn.lock
	yarn install
	@touch $@

-include build/.*.deps
