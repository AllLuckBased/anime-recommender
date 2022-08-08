import fs from 'fs'
import fetch from "node-fetch"
import Anime, { addAnime, getFormatValue, getMyStatusValue, getNewAnimeSeriesId, getStatusValue, searchAnime, updateAnime } from './account/Anime.js'
import { addIfGenreNotExists } from './account/Genre.js'
import { connect, myAniDB } from './database.js'

const SQLITE_MAX_COMPOUND_SELECT = 500 // sqlite3 default limit

async function makeAnilistQuery(graphqlFilePath, variables) {
    // const end = Date.now() + 750
    // while(Date.now() < end);
    console.log('request making...')
    const query = fs.readFileSync(graphqlFilePath, 'utf-8')

    return (await (await fetch('https://graphql.anilist.co/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            query, variables
        })
    })).json()).data
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
    let dedupe = new Map()

    const insertRecords = async () => {
        if (recordCount === 0) return

        const sqlPrefix = "insert into GlobalAnimeRatings (userId, animeId, score) select t1.userId, t1.animeId, t1.score from (\n"
        const sqlSuffix = "\n" + ") t1 left join GlobalAnimeRatings t2\n"+
        "on t1.userId = t2.userId and t1.animeId = t2.animeId\n"+
        "where t2.animeId is null"

        sql = sqlPrefix + sql + sqlSuffix

        await myAniDB.run(sql)

        sql = ""
        recordCount = 0
    }

    const addRecord = async (entry) => {
        if (dedupe.get(entry.media.id)) return
        dedupe.set(entry.media.id, true)

        if (sql !== "") sql += "union "
        sql += `select ${userId} as userId, ${entry.media.id} as animeId, ${entry.score} as score\n`

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
    console.log('Added data for user: ' + userId)
}

export async function getUserIdDescWatchTime() {
    let users
    let start = false
    for(let page = 3; (users = (await makeAnilistQuery('./users.graphql', {page: page})).Page.users).length != 0; page++) {
        console.log('-------- PAGE: ' + page + ' ------------')
        for(const user of users) {
            if(user.id == 174234) {
                start = true
                continue
            }
            if(start && user.statistics.anime.count > 50) {
                await addUserListData(user.id)
            }
        }
    }
}