-- Migration: Add 'file' to source_type enum
-- Reason: DOCX, XLSX, CSV and other binary files were previously stored as 'text'
-- which was misleading (text implies plain text content, not binary file upload).
-- 'file' is a dedicated type that correctly signals "binary file stored in Storage".
--
-- This allows the frontend to use sourceType='file' in DB (not just as n8n routing signal)
-- and enables cleaner queries: WHERE type = 'file' to find all uploaded office/spreadsheet docs.

ALTER TYPE source_type ADD VALUE IF NOT EXISTS 'file';
