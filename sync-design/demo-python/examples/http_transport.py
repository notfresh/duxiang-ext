"""HTTP 传输层实现 - 真实的网络通信"""
import json
import urllib.request
import urllib.error
from typing import Any, Dict
from interfaces import INetworkTransport, NetworkResponse


class HttpTransport(INetworkTransport):
    """基于 HTTP 的网络传输实现"""

    def __init__(self, peer_urls: Dict[str, str] = None):
        """
        Args:
            peer_urls: {peer_id: "http://host:port"} 的映射
        """
        self.peer_urls = peer_urls or {}

    def register_peer(self, peer_id: str, url: str) -> None:
        """注册对等节点的 URL"""
        self.peer_urls[peer_id] = url
        print(f"[HTTP] Registered peer: {peer_id} -> {url}")

    def get(self, peer_id: str, path: str, params: Dict[str, Any]) -> NetworkResponse:
        if peer_id not in self.peer_urls:
            return NetworkResponse(success=False, error=f"Peer not found: {peer_id}")

        base_url = self.peer_urls[peer_id]
        query = "&".join(f"{k}={v}" for k, v in params.items())
        url = f"{base_url}{path}?{query}"

        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return NetworkResponse(success=True, data=data)
        except Exception as e:
            return NetworkResponse(success=False, error=str(e))

    def post(self, peer_id: str, path: str, body: Dict[str, Any]) -> NetworkResponse:
        if peer_id not in self.peer_urls:
            return NetworkResponse(success=False, error=f"Peer not found: {peer_id}")

        base_url = self.peer_urls[peer_id]
        url = f"{base_url}{path}"
        payload = json.dumps(body).encode("utf-8")

        try:
            req = urllib.request.Request(
                url,
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return NetworkResponse(success=True, data=data)
        except Exception as e:
            return NetworkResponse(success=False, error=str(e))
