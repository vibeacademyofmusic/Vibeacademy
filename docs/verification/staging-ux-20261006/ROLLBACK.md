# Staging rollback

Project: vibeacademy-staging (`prj_3N4d2PSVZWv4L2Xf0BwsguZppdzu`), team `team_y2GkHFTH08Wieo2XQ4QMRPRn`.

Serving alias before this optimization deploy:

- https://vibeacademy-staging.vercel.app
- https://vibeacademy-staging-vibeacademyofmusic.vercel.app
- https://staging.vibe.edu.vn
- Deployment: `dpl_Fa4MoNGDEJ4W8PoQofUkBYKFD38W`
- Source commit: `341f5b329abc15237b42ea5d6306a8f99d1b844b` (dirty upload)
- Functions region on the project: `icn1`

Do not redeploy that deployment with the default copy. A copy without `regions: ["icn1"]` previously came back as `iad1`.

Rollback command shape (Vercel API, team query required):

POST `/v13/deployments?teamId=team_y2GkHFTH08Wieo2XQ4QMRPRn&forceNew=1`

```json
{
  "name": "vibeacademy-staging",
  "deploymentId": "dpl_Fa4MoNGDEJ4W8PoQofUkBYKFD38W",
  "target": "production",
  "regions": ["icn1"]
}
```

Confirm the project name is `vibeacademy-staging` before the call. Do not patch project `vibeacademy`. After Ready, confirm the alias and `x-vercel-id` contains `icn1`.
