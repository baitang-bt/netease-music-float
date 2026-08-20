const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  MIN_API_MATCH_SCORE,
  scoreSongMatch,
  scoreLocalTrack,
  buildSearchQueries
} = require("../electron/netease-song-id");

describe("netease song id", () => {
  it("requires a title overlap before accepting a search hit", () => {
    assert.equal(
      scoreSongMatch(
        { name: "-18°", artists: [{ name: "王一珩OneSD" }] },
        { title: "Testify", artist: "void" }
      ),
      0
    );
    assert.equal(
      scoreSongMatch(
        { name: "Testify", artists: [{ name: "void" }] },
        { title: "Testify", artist: "void" }
      ),
      14
    );
  });

  it("boosts matches when album metadata aligns", () => {
    const withAlbum = scoreSongMatch(
      {
        name: "Testify",
        artists: [{ name: "void" }],
        album: { name: "Testify (feat. 星熊南巫)" }
      },
      {
        title: "Testify",
        artist: "void",
        album: "Testify (feat. 星熊南巫)"
      }
    );
    const withoutAlbum = scoreSongMatch(
      { name: "Testify", artists: [{ name: "void" }] },
      { title: "Testify", artist: "void" }
    );
    assert.ok(withAlbum > withoutAlbum);
    assert.ok(withAlbum >= MIN_API_MATCH_SCORE);
  });

  it("scores local cache rows the same way as search hits", () => {
    const score = scoreLocalTrack(
      {
        name: "Ether Strike",
        artists: [{ name: "Akira Complex" }],
        album: { name: "Arcaea" }
      },
      { title: "Ether Strike", artist: "Akira Complex", album: "Arcaea" }
    );
    assert.ok(score >= MIN_API_MATCH_SCORE);
  });

  it("builds search queries from title, artist, and album", () => {
    const queries = buildSearchQueries({
      title: "Testify",
      artist: "void",
      album: "Testify (feat. 星熊南巫)"
    });
    assert.deepEqual(queries, [
      "Testify void Testify (feat. 星熊南巫)",
      "Testify void",
      "Testify"
    ]);
  });
});
