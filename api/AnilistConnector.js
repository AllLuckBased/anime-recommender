import fs from 'fs'
import fetch from 'node-fetch'
import { addIfGenreNotExists } from '../dao/Genre.js'
import Anime, { addAnime, getFormatValue, getMyStatusValue, getNewAnimeSeriesId, getStatusValue, searchAnime, updateAnime } from '../dao/Anime.js'
import { addAnilistGlobalUserData } from '../dao/GlobalUserAnime.js'

const wait = (ms) => new Promise((res) => setTimeout(res, ms))
const getDateInMillis = (date) => new Date(date.month + '/' + date.day + '/' + date.year).getTime()

async function makeAnilistQuery(graphqlFilePath, variables) {
    const query = fs.readFileSync(graphqlFilePath, 'utf-8')
    let data
	try {
		data = (await (await fetch('https://graphql.anilist.co/', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Accept': 'application/json'
			},
			body: JSON.stringify({
				query, variables
			})
		})).json()).data
	} catch(e) {
		await wait(5000)
		return makeAnilistQuery(graphqlFilePath, variables)
	}
    if(data) return data
    else { // This means we have crossed the rate limit and are timed out!
        // Random small query just to get a response object
        const query = 'query { Media(id: 1) { id } }'
        const timeBeforeNextRequest = ((await fetch('https://graphql.anilist.co/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({query})
        })).headers.get('X-RateLimit-Reset')) - Date.now()
        await wait(timeBeforeNextRequest)
        return makeAnilistQuery(graphqlFilePath, variables)
    }
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

export async function updateMyDBFromAnilist(userId) {
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

export async function getUserIdDescWatchTime() {
    let page = 1
    let users = (await makeAnilistQuery('./users.graphql', {page: page})).Page.users
    while(true) {
        if(users.length == 0) {
            console.log('Got empty response from server. Waiting before next response...')
            await wait(10000)
			
			users = (await makeAnilistQuery('./users.graphql', {page: page})).Page.users
            continue;
        }

        console.log(`\n---------- PAGE: ${page} ----------`)
        for(const user of users) {
            if(user.statistics.anime.count > 50) {
                const data = (await makeAnilistQuery('./listShort.graphql', {userId: user.id})).MediaListCollection
                if(data) await addAnilistGlobalUserData(data)
            }
        }
        console.log('------------------------------\n')

        page++
        users = (await makeAnilistQuery('./users.graphql', {page: page})).Page.users
    }
}