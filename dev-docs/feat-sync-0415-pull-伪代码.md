/**
 * 拉取远程 master 分支
 * @param peerUrl 远程节点地址
 */
async function pull(peerUrl: string) {
    console.log(`🟢 开始 Pull 流程: ${peerUrl}`);

    // 1. 执行 Fetch：只下载数据，不修改本地工作区
    // 这一步会将远程的 commits 存入本地 objects 表，并更新 refs/origin/master
    const newCommits = await fetch(peerUrl, 'master');

    if (newCommits.length === 0) {
        console.log("✅ 已是最新，无需拉取");
        return;
    }

    console.log(`📥 下载完成，获取到 ${newCommits.length} 个新提交`);

    // 2. 执行 Merge：将远程变更应用到本地 master
    // 这里才是真正的“拉取代码”动作
    await mergeRemoteChanges('master', 'origin/master');
}

/**
 * Fetch 阶段：仅同步 DAG 历史
 * @param peerUrl 远程地址
 * @param branchName 分支名 (例如 'master')
 * @returns 新下载的 Commit 列表
 */
async function fetch(peerUrl: string, branchName: string): Promise<Commit[]> {
    // 1. 获取本地记录的“远程分支指针”
    // 注意：这里取的是 origin/master，而不是本地的 master
    // 如果是新安装，localOriginHead 将是 GENESIS_HASH
    let localOriginHead = Store.getRef(`origin/${branchName}`); 
    
    console.log(`📡 发起 Fetch: 本地认为远端停在 ${localOriginHead}`);

    // 2. 建立连接并发送握手请求
    // 【关键点】：我们只发送 localOriginHead，绝不发送本地 master 的 HEAD
    // 这样远程就知道我们缺哪些数据，而不会知道我们本地正在做什么
    const connection = await P2P.connect(peerUrl);
    
    const request = {
        type: 'FETCH_REQUEST',
        branch: branchName,
        have: localOriginHead  // 告诉对方：我已经有这个及其祖先了
    };

    await connection.send(request);

    // 3. 接收远程发来的 Commit 流
    // 远程会计算：RemoteHead -> ... -> LCA(localOriginHead, RemoteHead)
    // 然后把中间缺失的 Commit 发过来
    const incomingCommits: Commit[] = await connection.receiveCommits();

    if (incomingCommits.length === 0) return [];

    // 4. 持久化到本地版本库 (Objects)
    // 此时数据只在 .git/objects (版本库) 中，还没到工作区
    for (const commit of incomingCommits) {
        // 验证哈希完整性
        if (!Hash.verify(commit)) throw new Error("Corrupted commit");
        
        // 存入本地数据库
        Store.saveObject(commit.hash, commit);
        console.log(`💾 存入 Commit: ${commit.hash}`);
    }

    // 5. 更新本地的“远程追踪指针”
    // 获取远程发来的最新 HEAD (即 incomingCommits 的最后一个)
    const newRemoteHead = incomingCommits[incomingCommits.length - 1].hash;
    
    // 移动 origin/master 指针指向最新的远程提交
    Store.setRef(`origin/${branchName}`, newRemoteHead);

    return incomingCommits;
}

/**
 * 合并远程变更到本地分支
 */
async function mergeRemoteChanges(localBranch: string, remoteBranch: string) {
    const localHead = Store.getRef(localBranch);
    const remoteHead = Store.getRef(remoteBranch);

    // 1. 寻找最近公共祖先 (LCA)
    // 比如：本地在 C2，远程在 C5。LCA 是 C2。
    const baseCommitHash = DAG.findLCA(localHead, remoteHead);

    // 2. 计算差异集 (Diff)
    // 获取从 LCA 到 remoteHead 之间的所有变更
    const changes = DAG.getChangesBetween(baseCommitHash, remoteHead);

    // 3. 应用变更到工作区
    for (const change of changes) {
        const targetId = change.targetId;
        const localObj = Store.getObject(targetId); // 本地工作区的对象
        const remoteObj = change.payload;          // 远程传来的对象快照

        // 简单策略：如果本地没改过，直接覆盖
        // 复杂策略：如果本地也改了，调用 merge 接口
        if (localObj && localObj.version !== remoteObj.version) {
             // 这里可以加入更复杂的冲突检测逻辑
             // 比如检查本地对象是否也被修改过
        }

        // 更新工作区 (Working Set)
        Store.saveObjectToLocalState(remoteObj); 
    }

    // 4. 移动本地分支指针 (Fast-Forward)
    // 如果没有冲突，直接将 master 指针指向 remoteHead
    Store.setRef(localBranch, remoteHead);
    
    console.log(`✅ Pull 完成，${localBranch} 已更新至 ${remoteHead}`);
}


/**
 * PeerB 处理来自 Peer A 的 Fetch 请求
 * @param connection P2P 连接对象
 * @param request 接收到的请求包
 */
async function handleFetchRequest(connection: Connection, request: FetchRequest) {
    console.log(`📩 收到 Fetch 请求: 对方想要分支 [${request.branch}], 拥有 [${request.have}]`);

    const branchName = request.branch;
    const peerHaveHash = request.have;

    // 1. 获取本地该分支的最新 HEAD
    // 假设 Peer B 的 master 指向 C5
    const myHeadHash = Store.getRef(branchName); 

    // 2. 寻找最近公共祖先 (LCA)
    // 这是核心算法：找出 "对方有的" 和 "我有的" 的交集起点
    // 场景：对方有 C1, 我有 C5 (C1->C2->C3->C4->C5)
    // LCA 结果应该是 C1
    const lcaHash = DAG.findLCA(peerHaveHash, myHeadHash);

    console.log(`🔍 计算 LCA: ${lcaHash}`);

    // 3. 计算差异列表 (Missing Commits)
    // 我们需要把从 LCA 到 我的HEAD 之间的所有 Commit 找出来
    // 结果应该是 [C2, C3, C4, C5] (按拓扑排序，从旧到新)
    const missingCommits = DAG.getCommitsBetween(lcaHash, myHeadHash);

    if (missingCommits.length === 0) {
        console.log("✅ 对方已是最新，无需发送数据");
        await connection.send({ type: 'FETCH_END', count: 0 });
        return;
    }

    console.log(`🚚 准备发送 ${missingCommits.length} 个 Commits`);

    // 4. 发送 Commit 流
    // 为了不阻塞网络，我们逐个发送，或者分批发送
    for (const commit of missingCommits) {
        // 从本地对象存储中读取完整的 Commit 对象
        // 注意：这里读取的是包含 changes 数组的完整对象
        const fullCommit = Store.getObject(commit.hash);
        
        // 发送数据包
        await connection.send({
            type: 'COMMIT_PACK',
            payload: fullCommit
        });
    }

    // 5. 发送结束信号
    await connection.send({
        type: 'FETCH_END',
        count: missingCommits.length,
        lastHash: myHeadHash // 告诉对方：这就是我现在最新的 HEAD
    });
    
    console.log("✅ 发送完成");
}

/**
** DAG
 * 获取从 startHash (不含) 到 endHash (含) 之间的所有 Commit
 * 返回顺序：从旧到新 (拓扑排序)
 */
function getCommitsBetween(startHash: string, endHash: string): Commit[] {
    const result: Commit[] = [];
    const queue: string[] = [endHash];
    const visited = new Set<string>();

    while (queue.length > 0) {
        const currentHash = queue.shift()!;
        
        if (visited.has(currentHash)) continue;
        visited.add(currentHash);

        // 如果遇到了起点（LCA），停止这条路径的遍历
        // 注意：LCA 本身不需要被同步，因为对方已经有了
        if (currentHash === startHash) continue;

        // 获取当前 Commit 对象
        const commit = Store.getObject(currentHash);
        if (!commit) continue; // 理论上不应该发生

        // 将其加入结果集（暂时是倒序，因为是回溯）
        result.push(commit);

        // 将父节点加入队列继续回溯
        // 注意：Git 是单向链表/多向链表，只能找 parents
        for (const parentHash of commit.parents) {
            if (!visited.has(parentHash)) {
                queue.push(parentHash);
            }
        }
    }

    // 因为我们是从 HEAD 往回找的，所以需要反转数组
    // 变成：从旧 (LCA的孩子) -> 新 (HEAD)
    return result.reverse();
}