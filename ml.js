import { connectToGlobalDB, globalAniDB } from "./dao/databaseConnections.js"
import GlobalUserAnime from "./dao/GlobalUserAnime.js"
import UserSimilarity, { insertUserSimilarity } from "./dao/UserSimilarityMinHeap.js"

function calculateRootMeanSquare(similarityMap) {
    let accumulator = 0
    for(const value of similarityMap.values()) accumulator += value*value
    return accumulator/Math.sqrt(similarityMap.size)
}

export async function findSimilarUsersFor(userId) {
    if(!globalAniDB) await connectToGlobalDB()    
    const targetUserAnime = new GlobalUserAnime(userId, 
        (await globalAniDB.all(`SELECT animeId, score FROM GlobalAnimeRatings WHERE userId = ${userId}`)))

    const users = await globalAniDB.all(`SELECT DISTINCT userId FROM GlobalAnimeRatings ORDER BY userId`)

    for(const user of users) {
        const globalUserAnime = new GlobalUserAnime(user.userId, 
            (await globalAniDB.all(`SELECT animeId, score FROM GlobalAnimeRatings WHERE userId = ${user.userId}`)))
        const intersection = targetUserAnime.checkSimilarity(globalUserAnime)
        if (intersection.size == 0) continue
        const userSimilarity = new UserSimilarity(user.userId, calculateRootMeanSquare(intersection))
        await insertUserSimilarity(userSimilarity)
    }
}