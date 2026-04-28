"""接口定义模块"""
from .entity import ISyncEntity
from .log import ISyncLog, Operation
from .provider import ISyncProvider
from .cursor import ISyncCursorManager
from .transport import INetworkTransport, NetworkResponse

__all__ = [
    'ISyncEntity',
    'ISyncLog',
    'Operation',
    'ISyncProvider',
    'ISyncCursorManager',
    'INetworkTransport',
    'NetworkResponse',
]
