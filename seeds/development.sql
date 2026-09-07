INSERT INTO users (id, email, display_name)
VALUES
  ('user-demo-1', 'user1@example.invalid', 'User Satu'),
  ('user-demo-2', 'user2@example.invalid', 'User Dua')
ON CONFLICT(id) DO UPDATE SET
  email = excluded.email,
  display_name = excluded.display_name,
  is_active = 1,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

INSERT INTO categories (
  id,
  owner_user_id,
  type,
  name,
  normalized_name,
  is_default
)
VALUES
  ('category-income-gaji', NULL, 'income', 'Gaji', 'gaji', 1),
  ('category-income-freelance', NULL, 'income', 'Freelance', 'freelance', 1),
  ('category-income-bonus', NULL, 'income', 'Bonus', 'bonus', 1),
  ('category-income-lainnya', NULL, 'income', 'Lainnya', 'lainnya', 1),
  (
    'category-expense-makanan-minuman',
    NULL,
    'expense',
    'Makanan & Minuman',
    'makanan & minuman',
    1
  ),
  ('category-expense-transport', NULL, 'expense', 'Transport', 'transport', 1),
  (
    'category-expense-tagihan-cicilan',
    NULL,
    'expense',
    'Tagihan & Cicilan',
    'tagihan & cicilan',
    1
  ),
  ('category-expense-hiburan', NULL, 'expense', 'Hiburan', 'hiburan', 1),
  ('category-expense-belanja', NULL, 'expense', 'Belanja', 'belanja', 1),
  ('category-expense-kesehatan', NULL, 'expense', 'Kesehatan', 'kesehatan', 1),
  ('category-expense-pendidikan', NULL, 'expense', 'Pendidikan', 'pendidikan', 1),
  ('category-expense-lainnya', NULL, 'expense', 'Lainnya', 'lainnya', 1),
  ('category-saving-tabungan', NULL, 'saving', 'Tabungan', 'tabungan', 1)
ON CONFLICT(id) DO UPDATE SET
  type = excluded.type,
  name = excluded.name,
  normalized_name = excluded.normalized_name,
  is_default = 1,
  is_active = 1,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
