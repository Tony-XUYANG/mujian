CREATE TABLE IF NOT EXISTS `user` (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(24) NOT NULL,
  password VARCHAR(255) NOT NULL,
  nickname VARCHAR(30) NOT NULL,
  role VARCHAR(10) NOT NULL DEFAULT 'USER',
  create_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_user_username UNIQUE (username),
  CONSTRAINT ck_user_role CHECK (role IN ('USER','ADMIN'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_profile (
  user_id BIGINT PRIMARY KEY,
  avatar_url VARCHAR(255),
  background_url VARCHAR(255),
  CONSTRAINT fk_profile_user FOREIGN KEY (user_id) REFERENCES `user`(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS drama (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(80) NOT NULL,
  cover_img VARCHAR(1000) NOT NULL,
  description VARCHAR(2000) NOT NULL,
  video_url VARCHAR(1000) NOT NULL,
  category VARCHAR(20) NOT NULL DEFAULT '都市',
  view_count BIGINT NOT NULL DEFAULT 0,
  create_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_drama_category (category),
  CONSTRAINT ck_drama_views CHECK (view_count >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_favorite (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  drama_id BIGINT NOT NULL,
  create_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_favorite UNIQUE (user_id,drama_id),
  CONSTRAINT fk_favorite_user FOREIGN KEY (user_id) REFERENCES `user`(id) ON DELETE CASCADE,
  CONSTRAINT fk_favorite_drama FOREIGN KEY (drama_id) REFERENCES drama(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_like (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  drama_id BIGINT NOT NULL,
  create_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_like UNIQUE (user_id,drama_id),
  CONSTRAINT fk_like_user FOREIGN KEY (user_id) REFERENCES `user`(id) ON DELETE CASCADE,
  CONSTRAINT fk_like_drama FOREIGN KEY (drama_id) REFERENCES drama(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS watch_history (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  drama_id BIGINT NOT NULL,
  progress_sec INT NOT NULL DEFAULT 0,
  duration_sec INT NOT NULL DEFAULT 0,
  last_watched TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uk_watch_history UNIQUE (user_id,drama_id),
  CONSTRAINT fk_history_user FOREIGN KEY (user_id) REFERENCES `user`(id) ON DELETE CASCADE,
  CONSTRAINT fk_history_drama FOREIGN KEY (drama_id) REFERENCES drama(id) ON DELETE CASCADE,
  CONSTRAINT ck_history_progress CHECK (progress_sec >= 0 AND duration_sec >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS drama_comment (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  drama_id BIGINT NOT NULL,
  content VARCHAR(500) NOT NULL,
  create_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_comment_user FOREIGN KEY (user_id) REFERENCES `user`(id) ON DELETE CASCADE,
  CONSTRAINT fk_comment_drama FOREIGN KEY (drama_id) REFERENCES drama(id) ON DELETE CASCADE,
  INDEX idx_comment_drama_time (drama_id,create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS drama_comment_report (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  comment_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  reason VARCHAR(120) NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'PENDING',
  create_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_time TIMESTAMP NULL,
  resolver_id BIGINT NULL,
  CONSTRAINT uk_comment_report UNIQUE (comment_id,user_id),
  CONSTRAINT fk_report_comment FOREIGN KEY (comment_id) REFERENCES drama_comment(id) ON DELETE CASCADE,
  CONSTRAINT fk_report_user FOREIGN KEY (user_id) REFERENCES `user`(id) ON DELETE CASCADE,
  CONSTRAINT fk_report_resolver FOREIGN KEY (resolver_id) REFERENCES `user`(id) ON DELETE SET NULL,
  CONSTRAINT ck_report_status CHECK (status IN ('PENDING','RESOLVED','DISMISSED')),
  INDEX idx_report_status (status,create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS drama_comment_moderation (
  comment_id BIGINT PRIMARY KEY,
  status VARCHAR(10) NOT NULL DEFAULT 'VISIBLE',
  reason VARCHAR(120),
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  moderator_id BIGINT NULL,
  CONSTRAINT fk_moderation_comment FOREIGN KEY (comment_id) REFERENCES drama_comment(id) ON DELETE CASCADE,
  CONSTRAINT fk_moderation_moderator FOREIGN KEY (moderator_id) REFERENCES `user`(id) ON DELETE SET NULL,
  CONSTRAINT ck_moderation_status CHECK (status IN ('VISIBLE','HIDDEN'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS drama_series (
  drama_id BIGINT PRIMARY KEY,
  status VARCHAR(12) NOT NULL DEFAULT 'COMPLETED',
  total_episodes INT NOT NULL DEFAULT 1,
  CONSTRAINT fk_series_drama FOREIGN KEY (drama_id) REFERENCES drama(id) ON DELETE CASCADE,
  CONSTRAINT ck_series_status CHECK (status IN ('SERIALIZING','COMPLETED')),
  CONSTRAINT ck_series_total CHECK (total_episodes BETWEEN 1 AND 500)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS drama_episode (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  drama_id BIGINT NOT NULL,
  episode_no INT NOT NULL,
  title VARCHAR(80) NOT NULL,
  video_url VARCHAR(1000) NOT NULL,
  create_time TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT uk_episode_number UNIQUE (drama_id,episode_no),
  CONSTRAINT fk_episode_drama FOREIGN KEY (drama_id) REFERENCES drama(id) ON DELETE CASCADE,
  CONSTRAINT ck_episode_number CHECK (episode_no BETWEEN 1 AND 500)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS episode_progress (
  user_id BIGINT NOT NULL,
  episode_id BIGINT NOT NULL,
  progress_sec INT NOT NULL DEFAULT 0,
  duration_sec INT NOT NULL DEFAULT 0,
  last_watched TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (user_id,episode_id),
  CONSTRAINT fk_episode_progress_user FOREIGN KEY (user_id) REFERENCES `user`(id) ON DELETE CASCADE,
  CONSTRAINT fk_episode_progress_episode FOREIGN KEY (episode_id) REFERENCES drama_episode(id) ON DELETE CASCADE,
  CONSTRAINT ck_episode_progress CHECK (progress_sec >= 0 AND duration_sec >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_follow (
  user_id BIGINT NOT NULL,
  drama_id BIGINT NOT NULL,
  create_time TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (user_id,drama_id),
  CONSTRAINT fk_follow_user FOREIGN KEY (user_id) REFERENCES `user`(id) ON DELETE CASCADE,
  CONSTRAINT fk_follow_drama FOREIGN KEY (drama_id) REFERENCES drama(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Epoch milliseconds keep release times independent of JVM / MySQL session timezones.
CREATE TABLE IF NOT EXISTS episode_release_plan (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  drama_id BIGINT NOT NULL,
  episode_no INT NOT NULL,
  title VARCHAR(80) NOT NULL,
  video_url VARCHAR(1000) NOT NULL,
  publish_at BIGINT NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'SCHEDULED',
  episode_id BIGINT NULL,
  published_at BIGINT NULL,
  CONSTRAINT fk_plan_drama FOREIGN KEY (drama_id) REFERENCES drama(id) ON DELETE CASCADE,
  CONSTRAINT fk_plan_episode FOREIGN KEY (episode_id) REFERENCES drama_episode(id) ON DELETE SET NULL,
  CONSTRAINT ck_plan_number CHECK (episode_no BETWEEN 1 AND 500),
  CONSTRAINT ck_plan_status CHECK (status IN ('SCHEDULED','PUBLISHED','CANCELLED')),
  INDEX idx_plan_due (status,publish_at),
  INDEX idx_plan_drama (drama_id,episode_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_reservation (
  user_id BIGINT NOT NULL,
  plan_id BIGINT NOT NULL,
  PRIMARY KEY (user_id,plan_id),
  CONSTRAINT fk_reservation_user FOREIGN KEY (user_id) REFERENCES `user`(id) ON DELETE CASCADE,
  CONSTRAINT fk_reservation_plan FOREIGN KEY (plan_id) REFERENCES episode_release_plan(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_notification (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  episode_id BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  read_at BIGINT NULL,
  CONSTRAINT uk_notification_episode UNIQUE (user_id,episode_id),
  CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES `user`(id) ON DELETE CASCADE,
  CONSTRAINT fk_notification_episode FOREIGN KEY (episode_id) REFERENCES drama_episode(id) ON DELETE CASCADE,
  INDEX idx_notification_inbox (user_id,read_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Merchant storefronts and shoppable video products.
CREATE TABLE IF NOT EXISTS shop (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  owner_id BIGINT NOT NULL,
  name VARCHAR(80) NOT NULL,
  logo_url VARCHAR(1000),
  description VARCHAR(500),
  status VARCHAR(12) NOT NULL DEFAULT 'ACTIVE',
  create_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uk_shop_owner UNIQUE (owner_id),
  CONSTRAINT fk_shop_owner FOREIGN KEY (owner_id) REFERENCES `user`(id) ON DELETE CASCADE,
  CONSTRAINT ck_shop_status CHECK (status IN ('ACTIVE','CLOSED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS shop_product (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  shop_id BIGINT NOT NULL,
  name VARCHAR(120) NOT NULL,
  image_url VARCHAR(1000),
  description VARCHAR(500),
  price DECIMAL(10,2) NOT NULL,
  stock INT NOT NULL DEFAULT 0,
  version BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(12) NOT NULL DEFAULT 'ON_SALE',
  create_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_product_shop FOREIGN KEY (shop_id) REFERENCES shop(id) ON DELETE CASCADE,
  CONSTRAINT ck_product_price CHECK (price >= 0),
  CONSTRAINT ck_product_stock CHECK (stock >= 0),
  CONSTRAINT ck_product_status CHECK (status IN ('ON_SALE','OFF_SALE')),
  INDEX idx_product_shop_status (shop_id,status,create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS drama_product (
  drama_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  create_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (drama_id,product_id),
  CONSTRAINT fk_drama_product_drama FOREIGN KEY (drama_id) REFERENCES drama(id) ON DELETE CASCADE,
  CONSTRAINT fk_drama_product_product FOREIGN KEY (product_id) REFERENCES shop_product(id) ON DELETE CASCADE,
  INDEX idx_drama_product_order (drama_id,sort_order,product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS shop_order (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  order_no VARCHAR(32) NOT NULL,
  buyer_id BIGINT NOT NULL,
  shop_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  request_key VARCHAR(64) NOT NULL,
  product_name VARCHAR(120) NOT NULL,
  image_url VARCHAR(1000),
  recipient VARCHAR(40) NOT NULL,
  phone VARCHAR(24) NOT NULL,
  address VARCHAR(300) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  expires_at TIMESTAMP NOT NULL,
  create_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uk_shop_order_no UNIQUE (order_no),
  CONSTRAINT uk_order_request UNIQUE (buyer_id,request_key),
  CONSTRAINT fk_order_buyer FOREIGN KEY (buyer_id) REFERENCES `user`(id) ON DELETE CASCADE,
  CONSTRAINT fk_order_shop FOREIGN KEY (shop_id) REFERENCES shop(id) ON DELETE RESTRICT,
  CONSTRAINT fk_order_product FOREIGN KEY (product_id) REFERENCES shop_product(id) ON DELETE RESTRICT,
  CONSTRAINT ck_order_quantity CHECK (quantity BETWEEN 1 AND 99),
  CONSTRAINT ck_order_amount CHECK (unit_price >= 0 AND total_amount >= 0),
  CONSTRAINT ck_order_status CHECK (status IN ('PENDING','PAID','SHIPPED','COMPLETED','CANCELLED')),
  INDEX idx_order_expiry (status,expires_at),
  INDEX idx_order_buyer (buyer_id,create_time),
  INDEX idx_order_shop (shop_id,status,create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS shop_video (
  drama_id BIGINT PRIMARY KEY,
  shop_id BIGINT NOT NULL,
  CONSTRAINT fk_shop_video_drama FOREIGN KEY (drama_id) REFERENCES drama(id) ON DELETE CASCADE,
  CONSTRAINT fk_shop_video_shop FOREIGN KEY (shop_id) REFERENCES shop(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Detailed shopping experience; additive tables preserve existing orders.
CREATE TABLE IF NOT EXISTS shop_product_detail (
  product_id BIGINT PRIMARY KEY,
  category VARCHAR(30) NOT NULL DEFAULT '生活日用',
  material VARCHAR(100) NOT NULL DEFAULT '',
  specification VARCHAR(100) NOT NULL DEFAULT '',
  origin VARCHAR(80) NOT NULL DEFAULT '',
  shipping_from VARCHAR(80) NOT NULL DEFAULT '',
  detail_text VARCHAR(4000) NOT NULL DEFAULT '',
  image_urls JSON NOT NULL,
  FOREIGN KEY (product_id) REFERENCES shop_product(id) ON DELETE CASCADE,
  INDEX idx_detail_category (category,product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS shopping_cart (
  user_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  quantity INT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id,product_id),
  FOREIGN KEY (user_id) REFERENCES `user`(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES shop_product(id) ON DELETE CASCADE,
  CHECK (quantity BETWEEN 1 AND 99)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS shipping_address (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  recipient VARCHAR(40) NOT NULL,
  phone VARCHAR(24) NOT NULL,
  region VARCHAR(100) NOT NULL,
  detail VARCHAR(180) NOT NULL,
  label VARCHAR(12) NOT NULL DEFAULT '家',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  FOREIGN KEY (user_id) REFERENCES `user`(id) ON DELETE CASCADE,
  INDEX idx_address_user (user_id,is_default,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS product_favorite (
  user_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  create_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id,product_id),
  FOREIGN KEY (user_id) REFERENCES `user`(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES shop_product(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS checkout_batch (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  buyer_id BIGINT NOT NULL,
  request_key VARCHAR(64) NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_checkout_request (buyer_id,request_key),
  FOREIGN KEY (buyer_id) REFERENCES `user`(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS checkout_batch_item (
  batch_id BIGINT NOT NULL,
  order_no VARCHAR(32) NOT NULL,
  PRIMARY KEY (batch_id,order_no),
  UNIQUE KEY uk_checkout_order (order_no),
  FOREIGN KEY (batch_id) REFERENCES checkout_batch(id) ON DELETE CASCADE,
  FOREIGN KEY (order_no) REFERENCES shop_order(order_no) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS shop_order_event (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  order_no VARCHAR(32) NOT NULL,
  status VARCHAR(16) NOT NULL,
  description VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_no) REFERENCES shop_order(order_no) ON DELETE CASCADE,
  INDEX idx_order_event (order_no,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS product_review (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  product_id BIGINT NOT NULL,
  buyer_id BIGINT NOT NULL,
  order_no VARCHAR(32) NOT NULL,
  rating TINYINT NOT NULL,
  content VARCHAR(500) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'VISIBLE',
  create_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_product_review_order UNIQUE (order_no,product_id),
  CONSTRAINT fk_review_product FOREIGN KEY (product_id) REFERENCES shop_product(id) ON DELETE CASCADE,
  CONSTRAINT fk_review_buyer FOREIGN KEY (buyer_id) REFERENCES `user`(id) ON DELETE CASCADE,
  CONSTRAINT fk_review_order FOREIGN KEY (order_no) REFERENCES shop_order(order_no) ON DELETE CASCADE,
  CONSTRAINT ck_review_rating CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT ck_review_status CHECK (status IN ('VISIBLE','HIDDEN')),
  INDEX idx_review_product (product_id,status,create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Optional variants preserve all legacy product/cart/order records.
CREATE TABLE IF NOT EXISTS product_variant (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  product_id BIGINT NOT NULL,
  name VARCHAR(80) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  stock INT NOT NULL,
  on_sale BOOLEAN NOT NULL DEFAULT TRUE,
  FOREIGN KEY (product_id) REFERENCES shop_product(id) ON DELETE CASCADE,
  CHECK (price > 0 AND stock >= 0),
  INDEX idx_variant_product (product_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS variant_cart (
  user_id BIGINT NOT NULL,
  variant_id BIGINT NOT NULL,
  quantity INT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id,variant_id),
  FOREIGN KEY (user_id) REFERENCES `user`(id) ON DELETE CASCADE,
  FOREIGN KEY (variant_id) REFERENCES product_variant(id) ON DELETE CASCADE,
  CHECK (quantity BETWEEN 1 AND 99)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS order_variant (
  order_no VARCHAR(32) PRIMARY KEY,
  variant_id BIGINT NOT NULL,
  variant_name VARCHAR(80) NOT NULL,
  FOREIGN KEY (order_no) REFERENCES shop_order(order_no) ON DELETE CASCADE,
  FOREIGN KEY (variant_id) REFERENCES product_variant(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Optional attribute matrix. It augments product_variant without replacing the
-- legacy free-form specification rows used by older products and orders.
CREATE TABLE IF NOT EXISTS product_attribute (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  product_id BIGINT NOT NULL,
  name VARCHAR(40) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  FOREIGN KEY (product_id) REFERENCES shop_product(id) ON DELETE CASCADE,
  CONSTRAINT uk_product_attribute_name UNIQUE (product_id,name),
  INDEX idx_product_attribute_product (product_id,sort_order,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS product_attribute_value (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  attribute_id BIGINT NOT NULL,
  value VARCHAR(60) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  FOREIGN KEY (attribute_id) REFERENCES product_attribute(id) ON DELETE CASCADE,
  CONSTRAINT uk_product_attribute_value UNIQUE (attribute_id,value),
  INDEX idx_product_attribute_value_attribute (attribute_id,sort_order,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS product_variant_value (
  variant_id BIGINT NOT NULL,
  value_id BIGINT NOT NULL,
  PRIMARY KEY (variant_id,value_id),
  FOREIGN KEY (variant_id) REFERENCES product_variant(id) ON DELETE CASCADE,
  FOREIGN KEY (value_id) REFERENCES product_attribute_value(id) ON DELETE RESTRICT,
  INDEX idx_product_variant_value_value (value_id,variant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
