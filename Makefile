SETTINGS_FILE := settings/chrome-dev.json

BROWSERIFY := node_modules/.bin/browserify
ESLINT := node_modules/.bin/eslint
EXORCIST := node_modules/.bin/exorcist
MUSTACHE := node_modules/.bin/mustache
PRETTIER := node_modules/.bin/prettier

.PHONY: default
default: extension

.PHONY: clean
clean:
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

-include build/.*.deps
