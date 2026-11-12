-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "role" AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
-- Existing users have no password yet: an empty hash cannot authenticate.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "role" "role" NOT NULL DEFAULT 'user';
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP DEFAULT;

-- Compatibility with the unpublished CRUD branch if it was applied locally.
DO $$
DECLARE pair text[];
BEGIN
  FOREACH pair SLICE 1 IN ARRAY ARRAY[
    ['companies','createdAt','created_at'], ['companies','updatedAt','updated_at'],
    ['contacts','createdAt','created_at'], ['contacts','updatedAt','updated_at'],
    ['contacts','companyId','company_id']
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=pair[1] AND column_name=pair[2]) THEN
      EXECUTE format('ALTER TABLE %I RENAME COLUMN %I TO %I', pair[1], pair[2], pair[3]);
    END IF;
  END LOOP;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "companies" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT,
    "website" TEXT,
    "custom" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "contacts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "position" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "custom" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "contacts_company_id_idx" ON "contacts"("company_id");

-- AddForeignKey
DO $$ BEGIN
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
