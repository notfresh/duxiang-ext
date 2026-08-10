#!/usr/bin/env python3
"""
Python 生成加密数据到 server_data.json
"""
import base64
import json
import hashlib
from Crypto.Cipher import AES
from Crypto.Random import get_random_bytes

PASSWORD = "DuXiangIsGreat"

# 测试数据
DATA = [
    {"title": "Google", "url": "https://google.com"},
    {"title": "GitHub", "url": "https://github.com"},
    {"title": "百度", "url": "https://baidu.com"}
]


def derive_key(password: str) -> bytes:
    return hashlib.sha256(password.encode('utf-8')).digest()


def encrypt(plaintext: str, password: str) -> dict:
    key = derive_key(password)
    iv = get_random_bytes(16)
    cipher = AES.new(key, AES.MODE_CBC, iv)

    # PKCS7 填充
    data = plaintext.encode('utf-8')
    padding_len = 16 - (len(data) % 16)
    padded = data + bytes([padding_len] * padding_len)
    ciphertext = cipher.encrypt(padded)

    return {
        'iv': base64.b64encode(iv).decode('utf-8'),
        'data': base64.b64encode(ciphertext).decode('utf-8')
    }


if __name__ == '__main__':
    # 加密每条数据
    encrypted_data = []
    for item in DATA:
        encrypted_item = {
            'title': encrypt(item['title'], PASSWORD),
            'url': encrypt(item['url'], PASSWORD)
        }
        encrypted_data.append(encrypted_item)

    # 写入文件
    output = {
        "data": DATA,
        "encrypted": encrypted_data
    }

    with open('server_data.json', 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print("已生成 server_data.json")
    print(f"原始数据: {len(DATA)} 条")
    print(f"加密数据: {len(encrypted_data)} 条")
