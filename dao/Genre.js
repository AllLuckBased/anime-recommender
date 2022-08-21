import Anime, { searchAnime } from "Anime.js"
import { myAniDB, connectToMyDB } from "databaseConnections.js"

export default class Genre {
    static fromObject(dbObject) {
        return new Genre(dbObject.id, dbObject.name)
    }

    constructor(id, name) {
        this.id = id
        this.name = name
    }
}

export async function addGenre(genre, animeIds) {
    if(!myAniDB) await connectToMyDB()
    try{
        const genreId = (await myAniDB.run('INSERT INTO Genre(name) VALUES (:name)', {
            ':name': genre.name
        })).lastID

        if(animeIds) {
            for(const animeId of animeIds) {
                try {
                    await myAniDB.run('INSERT INTO AnimeGenre VALUES(:animeId, :genreId)', {
                        ':animeId': animeId,
                        ':genreId': genreId
                    })
                } catch(e) {
                    console.error("Anime for the given id: " + animeId + " missing from the database!")
                    console.error(e)
                }
            }
        }
        return genreId
    } catch(e) {console.error('Error while adding genre to the database! ' + e.message)}
}

export async function searchGenre(id) {
    if(!myAniDB) await connectToMyDB()
    try{
        return await myAniDB.get('SELECT * FROM Genre WHERE id = ?', [id])
    } catch(e) {console.error('Error while searching genre' + id + ' from database! ' + e.message)}
}

export async function getAllAnimeOfGenre(genreId) {
    if(!myAniDB) await connectToMyDB()
    try {
        const animeObjIds = await myAniDB.all('SELECT animeId FROM AnimeGenre WHERE genreId = ?', [genreId])
        const allAnime = []
        for(const animeObjId of animeObjIds)
            allAnime.push(Anime.fromObject(searchAnime(animeObjId.animeId)))
        return allAnime
    } catch(e) {console.error('Error while searching all anime for genre ' + genreId + 'from database! ' + e.message)}
}

export async function checkGenreNameExists(name) {
    if(!myAniDB) await connectToMyDB()

    try {
        const genre = await myAniDB.get('SELECT * FROM Genre WHERE name = ?', [name])
        if(genre != null) return genre.id
        else return 0
    } catch(e) {console.error('Error while searching genre by name for name: ' + name + ' from database! ' + e.message)}
}

export async function addIfGenreNotExists(genreName) {
    const genreId = await checkGenreNameExists(genreName)
    if(!genreId)
        return await addGenre(new Genre(null, genreName))
    return genreId
}