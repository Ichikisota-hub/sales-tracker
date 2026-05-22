INSERT INTO organizations (name, slug, plan, is_active, settings)
VALUES ('TOP', 'top', 'basic', true, '{}')
ON CONFLICT (slug) DO NOTHING;
