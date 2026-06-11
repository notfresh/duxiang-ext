"""接口定义模块"""
from .entity import ISyncEntity, ConflictState, IConflictData
from .log import ISyncLog, IBatchLog, Operation
from .provider import ISyncProvider
from .cursor import ISyncCursorManager
from .transport import INetworkTransport, NetworkResponse

__all__ = [
    'ISyncEntity',
    'ConflictState',
    'IConflictData',
    'ISyncLog',
    'IBatchLog',
    'Operation',
    'ISyncProvider',
    'ISyncCursorManager',
    'INetworkTransport',
    'NetworkResponse',
]
