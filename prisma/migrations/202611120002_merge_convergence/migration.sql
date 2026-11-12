-- Reconcile databases that already applied the original CRUD migration before merge.
-- Extend the tables created by the auth branch; never create a second copy.
ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "industry" TEXT,
  ADD COLUMN IF NOT EXISTS "website" TEXT,
  ADD COLUMN IF NOT EXISTS "custom" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "createdById" UUID,
  ADD COLUMN IF NOT EXISTS "responsibleUserId" UUID;
ALTER TABLE "companies" ALTER COLUMN "name" TYPE TEXT;

ALTER TABLE "contacts"
  ADD COLUMN IF NOT EXISTS "firstName" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "lastName" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "full_name" TEXT,
  ADD COLUMN IF NOT EXISTS "position" TEXT,
  ADD COLUMN IF NOT EXISTS "custom" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "createdById" UUID,
  ADD COLUMN IF NOT EXISTS "responsibleUserId" UUID;
UPDATE "contacts" SET "full_name" = concat_ws(' ', "firstName", "lastName") WHERE "full_name" IS NULL;
ALTER TABLE "contacts"
  ALTER COLUMN "full_name" SET NOT NULL,
  ALTER COLUMN "firstName" DROP NOT NULL,
  ALTER COLUMN "lastName" DROP NOT NULL,
  ALTER COLUMN "email" TYPE TEXT,
  ALTER COLUMN "phone" TYPE TEXT;

-- Preserve rows: any pre-existing duplicate email stops migration, never deletes data.
CREATE UNIQUE INDEX IF NOT EXISTS "contacts_email_key" ON "contacts"("email");
CREATE INDEX IF NOT EXISTS "companies_createdById_idx" ON "companies"("createdById");
CREATE INDEX IF NOT EXISTS "companies_responsibleUserId_idx" ON "companies"("responsibleUserId");
CREATE INDEX IF NOT EXISTS "contacts_createdById_idx" ON "contacts"("createdById");
CREATE INDEX IF NOT EXISTS "contacts_responsibleUserId_idx" ON "contacts"("responsibleUserId");
DROP INDEX IF EXISTS "contacts_companyId_idx";
CREATE INDEX IF NOT EXISTS "contacts_company_id_idx" ON "contacts"("company_id");
ALTER TABLE "contacts" DROP CONSTRAINT IF EXISTS "contacts_companyId_fkey";
ALTER TABLE "contacts" DROP CONSTRAINT IF EXISTS "contacts_company_id_fkey";
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
DO $$
DECLARE tbl text; col text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['companies', 'contacts'] LOOP
    FOREACH col IN ARRAY ARRAY['createdById', 'responsibleUserId'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname=tbl || '_' || col || '_fkey' AND conrelid=to_regclass(tbl)) THEN
        EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE', tbl, tbl || '_' || col || '_fkey', col);
      END IF;
    END LOOP;
  END LOOP;
END $$;
