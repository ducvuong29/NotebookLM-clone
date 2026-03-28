# Admin API Contracts

This document outlines the API contracts for the `admin-api` Supabase Edge Function.

## Base Structure

All requests must include an `action` string in the JSON body.
All responses follow a unified format.

### Error Response
```json
{
  "error": true,
  "code": "ERROR_CODE",
  "message": "Human readable message"
}
```

### Success Response
```json
{
  "data": {
    // action specific data
  }
}
```

## Actions

### `create_public_notebook`
Creates a new notebook with optional `visibility` setting. Only accessible by Admin users.

**Request Body:**
```json
{
  "action": "create_public_notebook",
  "title": "Notebook Title",
  "visibility": "public"
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `title` | string | ✅ | — | Notebook title (max 100 chars) |
| `visibility` | string | ❌ | `"public"` | `"public"` or `"private"` |

**Success Response Data:**
```json
{
  "notebook_id": "uuid-of-created-notebook"
}
```

**Common Errors:**
- `400 INVALID_INPUT`: Missing or empty title, or invalid visibility value.
- `401 UNAUTHORIZED`: JWT missing or expired.
- `403 FORBIDDEN`: User is not an admin.
- `500 INTERNAL_ERROR`: Database insertion failed.

### `delete_public_notebook`
Deletes a public notebook and all its associated sources (database records and storage files). Only accessible by Admin users.

**Request Body:**
```json
{
  "action": "delete_public_notebook",
  "notebook_id": "uuid-of-notebook-to-delete"
}
```

**Success Response Data:**
```json
{
  "success": true
}
```

**Common Errors:**
- `400 INVALID_INPUT`: Missing notebook ID.
- `401 UNAUTHORIZED`: JWT missing or expired.
- `403 FORBIDDEN`: User is not an admin, or the notebook is not public.
- `404 NOT_FOUND`: Notebook does not exist.
- `500 INTERNAL_ERROR`: Database or storage deletion failed.

### `toggle_visibility`
Toggles a notebook's visibility between public and private. Only accessible by Admin users. Idempotent — if already at the desired visibility, returns success without mutation.

**Request Body:**
```json
{
  "action": "toggle_visibility",
  "notebook_id": "uuid-of-notebook",
  "visibility": "private"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `notebook_id` | string (UUID) | ✅ | Target notebook ID |
| `visibility` | string | ✅ | `"public"` or `"private"` |

**Success Response Data:**
```json
{
  "notebook_id": "uuid-of-notebook",
  "visibility": "private"
}
```

**Common Errors:**
- `400 INVALID_INPUT`: Missing notebook ID or invalid visibility value.
- `401 UNAUTHORIZED`: JWT missing or expired.
- `403 FORBIDDEN`: User is not an admin.
- `404 NOT_FOUND`: Notebook does not exist.
- `500 INTERNAL_ERROR`: Database update failed.
