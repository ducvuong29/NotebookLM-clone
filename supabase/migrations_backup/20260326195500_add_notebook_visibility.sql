-- Add visibility column to notebooks table
ALTER TABLE "public"."notebooks" 
ADD COLUMN IF NOT EXISTS "visibility" TEXT DEFAULT 'private' NOT NULL;
