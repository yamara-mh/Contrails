
# recordName

> This is the feed's ID which can be letters, numbers, or dashes. Spaces are not allowed. Maximum length is 15 characters.

who-liked-me-b

# displayName

> This is the title of the custom feed. Maximum length is 24 characters.

Who Liked My Post (β)

# description

> This is the description of the feed.

大まかな挙動：あなたの最近の投稿10件に最近いいねをしたユーザを10人ずつ取得し、各ユーザのトレンドポストを3件ずつ表示します。\n
ユーザ認証のやり方が分かったら通知欄からいいねしたユーザを取得する予定です。\n
Roughly speaking: Get 10 users who liked your latest 10 posts for each post. Display 3 trending posts from up to 100 users.

# searchTerms

> There are three types of search terms:
>
> - Keywords: Test these in [https://bsky.app/search](https://bsky.app/search). `AND` is implicit, so `cat dog` on one line will require both `cat` and `dog`. You can use quotes as well `"hot dog"`.
> - Users: links such as `https://bsky.app/profile/why.bsky.team` will pull in the user's posts. To include replies and reposts, you can add the following flags: `https://bsky.app/profile/why.bsky.team +replies +reposts`.
> - Pinned posts: links such as `https://bsky.app/profile/saddymayo.bsky.social/post/3jxju2wwap22e` will pin at the top of the feed. One link per line, please.

# denyList

> Deny list will exclude any results from a given user. You can provide the username or DID.
>
> - did:plc:1234
> - @spamspamspam.bsky.social

# safeMode

> Safe mode limits the total number of API calls coming from Cloudflare.
>
> Set to `false` if you have higher limits via a paid Cloudflare plan.

false

# avatar

> This must link to an image (PNG or JPEG) in the same directory as this CONFIG.md. It doesn't have to be called `avatar.png`, but just be sure this CONFIG.md points to the correct file.

![](icon.png)
