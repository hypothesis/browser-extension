SETTINGS_FILE := settings.json

BROWSERIFY := node_modules/.bin/browserify
EXORCIST := node_modules/.bin/exorcist
MUSTACHE := node_modules/.bin/mustache

.PHONY: default
default: extension

.PHONY: clean
clean:
	rm -rf build/*
	rm -rf dist/*

################################################################################

EXTENSION_SRC := content help images lib

.PHONY: extension
extension: build/extension.bundle.js
extension: build/manifest.json
extension: build/public
extension: build/public/app.html
extension: build/public/embed.js
extension: build/settings-data.js
extension: $(addprefix build/,$(EXTENSION_SRC))

build/extension.bundle.js: src/common/extension.js
	$(BROWSERIFY) -d $< | $(EXORCIST) $(addsuffix .map,$@) >$@
	@# When building the extension bundle, we also write out a list of
	@# depended-upon files to .extension.bundle.deps, which we then include to
	@# ensure that the bundle is rebuilt if any of these change. We ignore
	@# vendor dependencies.
	@$(BROWSERIFY) --list $< | \
		grep -v node_modules | \
		sed 's#^#$@: #' \
		>build/.extension.bundle.deps
build/manifest.json: src/chrome/manifest.json.mustache $(SETTINGS_FILE)
	$(MUSTACHE) $(SETTINGS_FILE) $< > $@
build/public:
	@mkdir -p $@
	cp -R node_modules/hypothesis/build/* $@
	@# We can't leave the client manifest in the build or the Chrome Web Store
	@# will complain.
	rm $@/manifest.json
build/public/app.html: src/client/app.html.mustache build/public $(SETTINGS_FILE)
	tools/template-context-app | $(MUSTACHE) - $< >$@
build/public/embed.js: src/client/embed.js.mustache build/public $(SETTINGS_FILE)
	tools/template-context-embed | $(MUSTACHE) - $< >$@
build/settings-data.js: src/chrome/settings-data.js.mustache build/public $(SETTINGS_FILE)
	tools/template-context-settings | $(MUSTACHE) - $< >$@
build/%: src/chrome/%
	@mkdir -p $@
	cp -R $</* $@

dist/%.zip dist/%.xpi: extension
	cd build && find . -not -path '*/\.*' -type f | zip -q -@ $(abspath $@)

-include build/.*.deps
