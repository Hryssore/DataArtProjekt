INSERT INTO shop_items (id, item_type, title, description, price_coins, unlock_level, asset_key, accent_color)
VALUES
  ('background-aurora', 'background', 'Aurora Mist', 'Soft teal glow for your profile background.', 0, 1, 'bg-aurora', '#31cab1'),
  ('background-midnight-grid', 'background', 'Midnight Grid', 'Deep blue grid with late-night focus energy.', 140, 2, 'bg-midnight-grid', '#5b88ff'),
  ('background-sunrise-wave', 'background', 'Sunrise Wave', 'Warm sunrise sweep for a brighter profile look.', 180, 3, 'bg-sunrise-wave', '#f39a5f'),
  ('background-emerald-cloud', 'background', 'Emerald Cloud', 'Green layered backdrop with calm room vibes.', 220, 4, 'bg-emerald-cloud', '#38b98f')
ON CONFLICT (id) DO NOTHING;
