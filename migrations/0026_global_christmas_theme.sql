-- Additive presentation preference. Existing rows retain paths/version and default to auto.
ALTER TABLE app_home_sections ADD COLUMN christmas_theme TEXT NOT NULL DEFAULT 'auto' CHECK(christmas_theme IN ('auto','on','off'));
