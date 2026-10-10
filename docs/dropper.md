# Account Dropper

Open **Dropper** in Meadow's dashboard. Choose one connected source account, select the destination accounts, and set the posting interval in minutes, hours, or days. The interval can range from one minute to seven days. Meadow shows recent videos from supported TikTok, YouTube, Instagram, Facebook, and Threads connections; availability depends on the provider and whether the video can be downloaded.

Review the videos and select the ones to include, then choose **Start dropper**. The first video is prepared immediately; subsequent videos are prepared at the selected interval. Each video goes to every selected destination account, subject to that destination's format and publishing requirements. The source account cannot also be a destination. Destination-specific settings still apply, including any required audience, visibility, or consent choices.

The peg-board animation previews the selected flow. Queue statuses show preparation, scheduled posts, failures, and cancellations. A prepared or scheduled video is not proof that a social platform has published it; follow delivery results in **Posts**.

**Stop dropper** cancels videos that have not been submitted to the publishing queue. Posts already submitted remain visible in Posts, where they can be reviewed or cancelled when their delivery state allows it. A stopped batch does not add new videos automatically, and settings changes do not alter destinations or intervals already saved with a batch.

Dropper work persists when the browser is closed. Production saves a durable wakeup for the next queued video or pending delivery, so long intervals can resume after the backend goes idle. Delayed processing preserves spacing instead of sending overdue videos in a burst. Connection removal and account deletion stop affected drops and erase their associated data.
