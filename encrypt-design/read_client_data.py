#!/usr/bin/env python3
"""
Python 读取 client_data.json 并解密
"""
import base64
import json
import hashlib
from Crypto.Cipher import AES

PASSWORD = "DuXiangIsGreat"


def derive_key(password: str) -> bytes:
    return hashlib.sha256(password.encode('utf-8')).digest()


def decrypt(encrypted: dict, password: str) -> str:
    key = derive_key(password)
    iv = base64.b64decode(encrypted['iv'])
    ciphertext = base64.b64decode(encrypted['data'])

    cipher = AES.new(key, AES.MODE_CBC, iv)
    padded = cipher.decrypt(ciphertext)

    padding = padded[-1]
    return padded[:-padding].decode('utf-8')


if __name__ == '__main__':
    try:
        with open('client_data.json', 'r', encoding='utf-8') as f:
            content = json.load(f)
    except FileNotFoundError:
        print("请先运行 JS 测试，生成 client_data.json")
        exit(1)

    data = content.get('data', [])
    encrypted = content.get('encrypted', [])

    print("=== 读取 client_data.json ===")
    print(f"原始数据: {len(data)} 条")
    print(json.dumps(data, ensure_ascii=False, indent=2))

    print("\n=== 解密加密数据 ===")
    decrypted = []
    for i, item in enumerate(encrypted):
        try:
            title = decrypt(item['title'], PASSWORD)
            url = decrypt(item['url'], PASSWORD)
            decrypted.append({'title': title, 'url': url})
            print(f"{i+1}. {title} -> {url}")
        except Exception as e:
            print(f"{i+1}. 解密失败: {e}")

    # 验证
    match = data == decrypted
    print(f"\n验证: {'✓ 成功' if match else '✗ 失败'}")
