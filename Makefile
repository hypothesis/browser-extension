SETTINGS_FILE := settings.json

.PHONY: default
default: chrome

.PHONY: chrome
chrome: dist/chrome.zip

.PHONY: clean
clean:
	rm -rf dist

################################################################################

dist/chrome.zip: dist/chrome
	zip -qr $@ $<

CHROME_SRC := content help images lib
dist/chrome: dist/chrome/manifest.json
dist/chrome: dist/chrome/settings-data.json
dist/chrome: dist/chrome/public
dist/chrome: $(addprefix dist/chrome/,$(CHROME_SRC))
dist/chrome/manifest.json: src/chrome/manifest.json.mustache $(SETTINGS_FILE)
	@mkdir -p dist/chrome
	$(shell npm bin)/mustache $(SETTINGS_FILE) $< > $@
dist/chrome/settings-data.json: $(SETTINGS_FILE)
	@mkdir -p dist/chrome
	cp $< $@
dist/chrome/public: node_modules/hypothesis
	@mkdir -p $@
	cp -R $</build/ $@
dist/chrome/%: src/chrome/%
	@mkdir -p $@
	cp -R $</ $@
