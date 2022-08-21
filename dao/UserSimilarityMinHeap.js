import { connectToMyDB, myAniDB } from "./databaseConnections.js"

let length = await userSimilarityListLength()
export default class UserSimilarity {
    constructor(userId, similarityScore) {
        this.userId = userId
        this.similarityScore = similarityScore
    }

    static fromObject(dbObject) {
        return new UserSimilarity(dbObject.userId, dbObject.similarityScore)
    }
}

export async function userSimilarityListLength() {
    try{
        if(!myAniDB) await connectToMyDB()
        return (await myAniDB.get('SELECT COUNT(1) AS length FROM UserSimilarityMinHeap')).length
    } catch(e) {console.log('Could not count length for user similarity table. ' + e.message)}
}

async function getUserSimilarityByIndex(idx) {
    if(!myAniDB) await connectToMyDB()

    try {
        return UserSimilarity.fromObject(await myAniDB.get('SELECT * FROM UserSimilarityMinHeap WHERE idx = ?', [idx]))
    } catch(e) {
        console.log('Error occurred while searching for user similarity idx: ' + idx + '! ' + e.message)
    }
}

async function getParentIndex(childIndex) {
    return ~~(childIndex/2)
}

async function getMinChildIndex(parentIndex) {
    const leftChildIndex = 2*parentIndex < length ? 2*parentIndex : null
    const rightChildIndex = 2*parentIndex + 1 < length ? 2*parentIndex + 1 : null

    if(leftChildIndex && rightChildIndex) {
        const leftChild = await getUserSimilarityByIndex(leftChildIndex)
        const rightChild = await getUserSimilarityByIndex(rightChildIndex)

        return leftChild.similarityScore < rightChild.similarityScore ? leftChildIndex : rightChildIndex
    }
        
    return leftChildIndex
}

async function addUserSimilarity(idx, userSimilarity) {
    const sql = `INSERT INTO UserSimilarityMinHeap VALUES (:idx, :userId, :similarityScore)`

    const values = {
        ':idx': idx,
        ':userId': userSimilarity.userId,
        ':similarityScore': userSimilarity.similarityScore
    }
    
    if(!myAniDB) await connectToMyDB()
    try {
        length++
        await myAniDB.run(sql, values)
    } catch(e) {
        console.error('Error while updating UserSimilarity ' + userSimilarity.userId + ' in database! ' + e.message)
    }
}

async function updateUserSimilarity(idx, userSimilarity) {
    const sql = `UPDATE UserSimilarityMinHeap
    SET 
        userId = :userId, similarityScore = :similarityScore 
    WHERE idx = :idx`

    const values = {
        ':idx': idx,
        ':userId': userSimilarity.userId,
        ':similarityScore': userSimilarity.similarityScore
    }
    
    if(!myAniDB) await connectToMyDB()
    try {
        return await myAniDB.run(sql, values)
    } catch(e) {console.error('Error while updating UserSimilarity ' + userSimilarity.userId + ' in database! ' + e.message)}
}

async function deleteUserSimilarity(idx) {
    if(!myAniDB) await connectToMyDB()

    try {
        length--
        return await myAniDB.run('DELETE FROM UserSimilarityMinHeap WHERE idx = :idx', {
            ':idx': idx
        })
    } catch(e) {
        console.error('Error while deleting user similarity ' + idx + ' from database! ' + e.message)
    }
}

export async function insertUserSimilarity(userSimilarity) {
    let insertIndex = length
    let parentIndex = await getParentIndex(insertIndex)
    let parentUserSimilarity
    
    await addUserSimilarity(insertIndex, userSimilarity)
    while(userSimilarity.similarityScore < (parentUserSimilarity = await getUserSimilarityByIndex(parentIndex)).similarityScore) {
        await updateUserSimilarity(insertIndex, parentUserSimilarity)
        await updateUserSimilarity(parentIndex, userSimilarity)
        insertIndex = parentIndex
        parentIndex = await getParentIndex(insertIndex)
    }
}

export async function removeUserSimilarity() {
    if(length == 1) return null

    const returnValue = await getUserSimilarityByIndex(1)
    const replacementValue = await getUserSimilarityByIndex(length-1)
    await updateUserSimilarity(1, replacementValue)
    await deleteUserSimilarity(length)
    
    let childValue
    let removeIndex = 1
    let minChildIndex = await getMinChildIndex(removeIndex)

    while(minChildIndex && replacementValue.similarityScore > (childValue = await getUserSimilarityByIndex(minChildIndex)).similarityScore) {
        await updateUserSimilarity(removeIndex, childValue)
        await updateUserSimilarity(minChildIndex, replacementValue)

        removeIndex = minChildIndex
        minChildIndex = await getMinChildIndex(removeIndex)
    }

    return returnValue
}