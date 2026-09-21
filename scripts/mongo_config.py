"""Server-only configuration. Never log connection strings or driver errors."""
from pathlib import Path
import os
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.tools' / 'mongodb'))
from dotenv import load_dotenv
from pymongo import MongoClient


def connect():
    load_dotenv(ROOT / '.env')
    uri = os.environ.get('MONGODB_URI')
    if not uri:
        raise ValueError('MONGODB_URI is missing')
    client = MongoClient(uri, serverSelectionTimeoutMS=12000, connectTimeoutMS=10000,
                         socketTimeoutMS=30000)
    client.admin.command('ping')
    return client, client[os.environ.get('MONGODB_DATABASE', 'pax')]


if __name__ == '__main__':
    try:
        client, db = connect()
        print('Atlas connection successful. Database:', db.name)
        print('Existing collection names:', db.list_collection_names())
        client.close()
    except Exception as exc:
        print(f'Atlas connection failed ({type(exc).__name__}). Check credentials and Atlas Network Access.', file=sys.stderr)
        sys.exit(1)
