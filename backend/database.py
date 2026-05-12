import os
from supabase import create_client, Client
from functools import lru_cache

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]  # service_role key bypasses RLS


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def get_db() -> Client:
    return get_supabase()
