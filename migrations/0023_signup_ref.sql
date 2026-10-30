-- Where each person came from when they signed up: the ?ref= on the first
-- link they opened (pub, tiktok, insta, share, squad...). Empty for people
-- who came straight in, and for everyone who joined before this.
ALTER TABLE users ADD COLUMN signup_ref TEXT;
