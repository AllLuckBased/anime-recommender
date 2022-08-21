import { globalAniDB, connectToGlobalDB } from "./databaseConnections.js"

export default class GlobalUserAnime {
    constructor(userId, globalDBData) {
        this.userId = userId
        this.animeRatings = new Map()
        for(const entry of globalDBData)
            this.animeRatings.set(entry.animeId, entry.score)
    }

    checkSimilarity(otherGlobalUserAnime) {
        const intersection = new Map()
        this.animeRatings.forEach((value, key) => {
            if(otherGlobalUserAnime.animeRatings.has(key))
                intersection.set(key, value - otherGlobalUserAnime.animeRatings.get(key))
        })

        return intersection
    }
}

export async function addAnilistGlobalUserData(anilistResponse) {
    if(!anilistResponse) return
    if(!globalAniDB) await connectToGlobalDB(true)

    let sql = ""
    let recordCount = 0

    const insertRecords = async () => {
        if (recordCount == 0) return

        const sqlPrefix = `INSERT INTO GlobalAnimeRatings (userId, animeId, score) 
        SELECT t1.userId, t1.animeId, t1.score FROM (\n\t\t`

        const sqlSuffix = '\n\t) t1 LEFT JOIN GlobalAnimeRatings t2 ON t1.userId = t2.userId AND t1.animeId = t2.animeId \n' +
        '\tWHERE t2.animeId IS NULL \n' +
        'ON CONFLICT(userId, animeId) DO NOTHING'
        
        await globalAniDB.run(sqlPrefix + sql + sqlSuffix)

        sql = ""
        recordCount = 0
    }

    const addRecord = async (entry) => {
        if (sql !== "") sql +=  'UNION \n\t\t'
        sql += `SELECT ${userId} AS userId, ${entry.media.id} AS animeId, ${entry.score} AS score `

        if (++recordCount == 500) { // SQLite compound insert default limit
            await insertRecords()
        }
    }
	
    for(const list of anilistResponse.lists) {
        for(const entry of list.entries) {
            if(!entry.score) continue
            await addRecord(entry)
        }
        await insertRecords()
    }
}


export async function getUserAnimeList(userId) {
    if(!globalAniDB) await connectToGlobalDB()

    try {
        return new GlobalUserAnime(userId, (
            await globalAniDB.all('SELECT animeId, score FROM GlobalAnimeRatings WHERE userId = ?', [userId])
        ))
    } catch(e) {
        console.log('Error fetching anime list for user: ' + userId + '! ' + e.message)
    }
}