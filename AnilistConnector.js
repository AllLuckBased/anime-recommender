import fs from 'fs'
import fetch from "node-fetch"
import Anime, { addAnime, getFormatValue, getMyStatusValue, getNewAnimeSeriesId, getStatusValue, searchAnime, updateAnime } from './account/Anime.js'
import { addIfGenreNotExists } from './account/Genre.js'
import { connect, myAniDB } from './database.js'

const SQLITE_MAX_COMPOUND_SELECT = 500 // sqlite3 default limit

async function makeAnilistQuery(graphqlFilePath, variables) {
    console.log(`Sending ${graphqlFilePath} request to anilist servers`)
    const query = fs.readFileSync(graphqlFilePath, 'utf-8')

    const data = (await (await fetch('https://graphql.anilist.co/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            query, variables
        })
    })).json()).data

    if(data) return data
    else { // This means we have crossed the rate limit and are timed out!
        // Random small query just to get a response object
        const query = 'query { Media(id: 1) { id } }'
        const nextRequestTimestamp = (await fetch('https://graphql.anilist.co/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({query})
        })).headers.get('X-RateLimit-Reset')

        while(Date.now() < nextRequestTimestamp);
        return makeAnilistQuery(graphqlFilePath, variables)
    }
}

function getDateInMillis(date) {
    return new Date(date.month + '/' + date.day + '/' + date.year).getTime()
}

async function addAllRelatedAnime(animeId) {
    const visited = []
    const animeSeriesId = await getNewAnimeSeriesId()
    async function addAllRelatedAnimeH(animeId) {
        const media = (await makeAnilistQuery('./media.graphql', {id: animeId})).Media
        visited.push(media.id)
        
        let name = media.title.english
        if(!name) name = media.title.romaji
        
        const genreIds = []
        for(const genreName of media.genres)
            genreIds.push(await addIfGenreNotExists(genreName))

        let prequelId = null
        console.log('Exploring relations for: ' + name)
        for(const edge of media.relations.edges) {
            console.log('\t' + edge.node.title.romaji + ' is a ' + edge.relationType)
            if(edge.node.type == 'ANIME' && edge.relationType != 'CHARACTER') {
                if(['PREQUEL', 'PARENT'].includes(edge.relationType))
                    prequelId = edge.node.id
                if(!visited.includes(edge.node.id))
                    await addAllRelatedAnimeH(edge.node.id)
            }
        }
        
        const currentAnime = new Anime(media.id, prequelId, name, getFormatValue(media.format), 
        media.episodes, media.duration, getStatusValue(media.status), getDateInMillis(media.startDate), 
        getDateInMillis(media.endDate), animeSeriesId, 0, 0, 0, null, null, 0, '')
        await addAnime(currentAnime, genreIds)
        console.log('Added ' + currentAnime.name + ' to the database')
        return currentAnime
    }
    return await addAllRelatedAnimeH(animeId)
}

export async function updateDBFromAnilist(userId) {
    const data = (await makeAnilistQuery('./listDetailed.graphql', {userId: userId})).MediaListCollection
    for(const list of data.lists) {
        for(const entry of list.entries) {
            let currentAnime = await searchAnime(entry.media.id)
            if(!currentAnime) currentAnime = await addAllRelatedAnime(entry.media.id)
            
            currentAnime.score = entry.score
            
            if (entry.status == 'REPEATING') entry.status = 'COMPLETED'
            currentAnime.myStatus = getMyStatusValue(entry.status)

            currentAnime.episodeProgress = entry.progress
            if(entry.startedAt) currentAnime.myStartDate = getDateInMillis(entry.startedAt)
            if(entry.completedAt) currentAnime.myFinishDate = getDateInMillis(entry.completedAt)
            currentAnime.totalRewatches = entry.totalRewatches
            currentAnime.notes = entry.notes
            
            await updateAnime(Anime.fromObject(currentAnime))
            console.log('\n UPDATED ENTRY ' + currentAnime.name + ' FROM YOUR ANIMELIST.\n')
        }
    }
}

async function addUserListData(userId) {
    const data = (await makeAnilistQuery('./listShort.graphql', {userId: userId})).MediaListCollection
    
    if(!myAniDB) await connect()

    let sql = ""
    let recordCount = 0

    const insertRecords = async () => {
        if (recordCount === 0) return

        const sqlPrefix = `INSERT INTO GlobalAnimeRatings (userId, animeId, score) 
        SELECT t1.userId, t1.animeId, t1.score FROM (\n\t\t`

        const sqlSuffix = '\n\t) t1 LEFT JOIN GlobalAnimeRatings t2 ON t1.userId = t2.userId AND t1.animeId = t2.animeId \n' +
        '\tWHERE t2.animeId IS NULL \n' +
        'ON CONFLICT(userId, animeId) DO NOTHING'
        
        const debug = sqlPrefix + sql + sqlSuffix
        await myAniDB.run(sqlPrefix + sql + sqlSuffix)

        sql = ""
        recordCount = 0
    }

    const addRecord = async (entry) => {
        if (sql !== "") sql +=  'UNION \n\t\t'

        sql += `SELECT ${userId} AS userId, ${entry.media.id} AS animeId, ${entry.score} AS score `

        recordCount++

        if (recordCount === SQLITE_MAX_COMPOUND_SELECT) {
            await insertRecords()
        }
    }

    for(const list of data.lists) {
        for(const entry of list.entries) {
            if(!entry.score) continue

            await addRecord(entry)
        }

        await insertRecords()
    }
    console.log('Added data for user id: ' + userId)
}

export async function getUserIdDescWatchTime() {
    let users
    for(let page = 1; (users = (await makeAnilistQuery('./users.graphql', {page: page})).Page.users).length != 0; page++) {
        console.log(`\n---------- PAGE: ${page} ----------`)
        for(const user of users) {
            if(user.statistics.anime.count > 50) {
                await addUserListData(user.id)
            }
        }
        console.log('------------------------------\n')
    }
}