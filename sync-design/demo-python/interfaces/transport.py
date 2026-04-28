"""网络传输接口定义"""
from abc import ABC, abstractmethod
from typing import Any, Dict


class NetworkResponse:
    """网络响应封装"""
    def __init__(self, success: bool, data: Any = None, error: str = None):
        self.success = success
        self.data = data
        self.error = error


class INetworkTransport(ABC):
    """Client 侧网络抽象接口"""
    
    @abstractmethod
    def get(self, peer_id: str, path: str, params: Dict[str, Any]) -> NetworkResponse:
        """发送 GET 请求"""
        pass
    
    @abstractmethod
    def post(self, peer_id: str, path: str, body: Dict[str, Any]) -> NetworkResponse:
        """发送 POST 请求"""
        pass
