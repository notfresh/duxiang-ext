"""JSON 文件存储实现"""
import json
import os
from typing import Dict, List, Any
from pathlib import Path


class JsonStorage:
    """基于 JSON 文件的简单存储实现"""
    
    def __init__(self, storage_dir: str = "./data"):
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(parents=True, exist_ok=True)
    
    def _get_file_path(self, filename: str) -> Path:
        """获取文件路径"""
        return self.storage_dir / f"{filename}.json"
    
    def load(self, filename: str) -> Dict[str, Any]:
        """加载 JSON 文件"""
        file_path = self._get_file_path(filename)
        if not file_path.exists():
            return {}
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"[WARN] Load file failed {filename}: {e}")
            return {}
    
    def save(self, filename: str, data: Dict[str, Any]) -> None:
        """保存到 JSON 文件"""
        file_path = self._get_file_path(filename)
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[ERROR] Save file failed {filename}: {e}")
            raise
    
    def load_list(self, filename: str) -> List[Any]:
        """加载 JSON 数组"""
        file_path = self._get_file_path(filename)
        if not file_path.exists():
            return []
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"[WARN] Load file failed {filename}: {e}")
            return []
    
    def save_list(self, filename: str, data: List[Any]) -> None:
        """保存数组到 JSON 文件"""
        file_path = self._get_file_path(filename)
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[ERROR] Save file failed {filename}: {e}")
            raise
