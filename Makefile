UUID = net-speed-monitor@pnr.tech
EXT_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
DIST_DIR = dist
ZIP_NAME = $(UUID).zip

SOURCES = \
	metadata.json \
	extension.js \
	dashboard.js \
	netReader.js \
	historyBuffer.js \
	utils.js \
	speedTest.js \
	persistence.js \
	notifications.js \
	prefs.js \
	stylesheet-dark.css \
	stylesheet-light.css \
	stylesheet.css

SCHEMA_DIR = schemas
SCHEMA_FILE = $(SCHEMA_DIR)/org.gnome.shell.extensions.net-speed-monitor.gschema.xml

.PHONY: all build compile-schemas install uninstall enable disable reload check package clean

all: build

build: compile-schemas

compile-schemas:
	@echo "Compiling GSettings schemas..."
	@glib-compile-schemas $(SCHEMA_DIR)
	@echo "Schemas compiled successfully."

check:
	@echo "Validating metadata.json..."
	@python3 -c "import json; m = json.load(open('metadata.json')); assert m['uuid'] == '$(UUID)'"
	@echo "Validating schema XML..."
	@python3 -c "import xml.etree.ElementTree as ET; ET.parse('$(SCHEMA_FILE)')"
	@echo "Validating JavaScript syntax..."
	@for f in $(filter %.js,$(SOURCES)); do \
		python3 -c "code = open('$$f').read(); assert code.count('{') == code.count('}'), f'Brace mismatch in $$f'"; \
	done
	@echo "All static checks passed."

install: build
	@echo "Installing extension to $(EXT_DIR)..."
	@mkdir -p $(EXT_DIR)/$(SCHEMA_DIR) $(EXT_DIR)/icons
	@cp -f $(SOURCES) $(EXT_DIR)/
	@cp -f $(SCHEMA_FILE) $(EXT_DIR)/$(SCHEMA_DIR)/
	@glib-compile-schemas $(EXT_DIR)/$(SCHEMA_DIR)
	@if [ -d icons ] && [ "$$(ls -A icons 2>/dev/null)" ]; then cp -rf icons/* $(EXT_DIR)/icons/; fi
	@echo "Installed successfully to $(EXT_DIR)"

uninstall:
	@echo "Disabling extension $(UUID)..."
	@-gnome-extensions disable $(UUID) 2>/dev/null || true
	@echo "Removing $(EXT_DIR)..."
	@rm -rf $(EXT_DIR)
	@echo "Uninstalled."

enable:
	@gnome-extensions enable $(UUID)

disable:
	@gnome-extensions disable $(UUID)

reload:
	@gnome-extensions disable $(UUID) && sleep 1 && gnome-extensions enable $(UUID)

package: check
	@echo "Packaging extension for distribution..."
	@mkdir -p $(DIST_DIR)
	@rm -f $(DIST_DIR)/$(ZIP_NAME)
	@zip -j $(DIST_DIR)/$(ZIP_NAME) $(SOURCES)
	@cd $(SCHEMA_DIR) && zip -u ../$(DIST_DIR)/$(ZIP_NAME) org.gnome.shell.extensions.net-speed-monitor.gschema.xml
	@if [ -d icons ] && [ "$$(ls -A icons 2>/dev/null)" ]; then zip -r $(DIST_DIR)/$(ZIP_NAME) icons/; fi
	@echo "Package created at $(DIST_DIR)/$(ZIP_NAME)"

clean:
	@rm -f $(SCHEMA_DIR)/gschemas.compiled
	@rm -rf $(DIST_DIR)
	@echo "Cleaned build artifacts."
