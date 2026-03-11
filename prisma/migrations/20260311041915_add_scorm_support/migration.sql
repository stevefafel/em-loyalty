-- AlterTable
ALTER TABLE "training_modules" ADD COLUMN     "content_type" TEXT NOT NULL DEFAULT 'pdf_quiz',
ADD COLUMN     "scorm_path" TEXT;
