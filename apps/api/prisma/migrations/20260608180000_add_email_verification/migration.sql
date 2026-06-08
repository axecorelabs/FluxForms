-- AlterTable
ALTER TABLE "users" ADD COLUMN "email" TEXT,
                    ADD COLUMN "email_verified" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
