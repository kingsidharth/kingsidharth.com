---
title: "Designing Frameworks: tame massive scope & complexity"
description: Case study in building a design framework for millions of tickets
pubDate: 2019-10-22
tags: []
---

<!-- Imported by scripts/import-64notes.ts -->

Millions of customers from over 120 countries use [Headout](https://www.headout.com) every month to book experiences like guided tours, attractions, and activities.

We have over 5,000 listed products; each may have several partners fulfilling the experience. For these products, we generate more than 5,000 types of tickets on our platform.

This is how most of these tickets looked like:

![The original headout ticket, with important information hidden in a huge wall of text.](/media/64notes/2019/design-framework/headout-ticket-original.png)

 <video width="100%" autoplay="" loop=""><source src="/media/64notes/2019/design-framework/meme-aint-nobody-got-time-for-that.mp4" type="video/mp4"> Meme: Confused (video can't load in your browser)</video>

Customers were missing out on their experiences because of bad ticket design! The most critical of these issues were:

1.  For print tickets, customers were missing out that they had to print it
2.  When the customers received a mobile ticket they would reach the location only to find out their network/internet does not work
3.  Customers were missing out on the location they're supposed to reach
4.  Customers were not able to locate the Bar Code, QR Code, or the partner ticket ID required to access the experience

The content & marketing team did an audit & redesigned the ticket:

![The revised ticket is an imporvement, but the important information is still lost.](/media/64notes/2019/design-framework/headout-ticket-revision-1.png)

The revised version of ticket was better; but important information was still easy to miss.

There were some improvements. However, the problems wouldn't go away.

 <video width="100%" autoplay="" loop=""><source src="/media/64notes/2019/design-framework/meme-pulp-fiction-confused.mp4" type="video/mp4"> Meme: Confused (video can't load in your browser)</video>

At first glance, we see several issues like:

1.  That QR Code looks like a way to access the 5% discount; it's not — the on-ground staff scans it to validate the ticket
2.  Most people will skip the text (it's critical to read it)
3.  Maps look better, but there is visual noise and the contrast ratio doesn't survive a black & white printing

With an ever growing number of listings, tickets, and usecases we needed something more robust.

Let's redesign the tickets, right?

<video width="100%" autoplay="" loop=""><source src="/media/64notes/2019/design-framework/meme-get-ready.mp4" type="video/mp4"></video>

Sure. Let's start by taking a look at the information we are communicating. Here's a list (most of) the variables that go into a ticket.

![A preview of the list of variables and states we were dealing with to design these tickets](/media/64notes/2019/design-framework/ticket-variables.png)

Most of these variables have at least two states (Present & Absent); some have 4+ states & several ways to represent the data.

That's 30+ variables with at least 27x2 = 54 states.

Our simplest ticket uses 7 variables (7x~2 states = ~14 states) from the list. That's ~3,432 combinations. \[[C(n,r)](https://en.wikipedia.org/wiki/Combination) => 14!/(7!(14-7)!\]

With the remaining 20+ variables — There are at least ~1,84,756 combinations that exist!

<video width="100%" autoplay="" loop=""><source src="/media/64notes/2019/design-framework/meme-calculating.mp4" type="video/mp4"></video>

Of course, not all these combinations would be realistic, but even if we were to take a conservative estimate, only 10% are realistic; that leaves us with at least 1,800 additional combinations to design for.

![Meme: Sheldon Copper throwing papers.](/media/64notes/2019/design-framework/meme-sheldon-throwing-papers.webp)

We need a better way than iterating each possible combination. Or checking if it's realistic.

## Taming the Beast

### Using Qualitative Data in Design Process: Support Tickets, Chats, NPS Comments, App Store & Play Store Ratings, etc.

We create design frameworks to manage complex problems like these. What's a framework, and how does you create one? Let's learn by building one!

We are in the process of building our Design System. The goal of the building this system is to aid designers in:

1.  **Understanding the problems:** For this, we use design frameworks
2.  **Iterate solutions:** For this, we make component libraries and style guides like — UI Kit, Print Style Guide, Ad Style Guide — which are documentation of decisions & constraints.

We start with problems. When in doubt, focus on understanding the problem better.

Some context can help us tame the ticket madness. This is where stories of our customers, who used these tickets, came in handy. We didn't have to look too far — the customer ops. team had detailed stories of these customers, and we had NPS comments & support tickets raised by the customers.

These stories & narratives can help reveal insights, and validate our hypothesis. Let's take an example of 3 such NPS comments that illustrate this well:

![3 example NPS comments to understand problems related to the meeting point.](/media/64notes/2019/design-framework/nps-comments-example-for-meeting-point.png)

<video width="100%" autoplay="" loop=""><source src="/media/64notes/2019/design-framework/meme-embarrasing.mp4" type="video/mp4"></video>

The meeting point is trouble.

We can see clear patterns; and use customer's own words & actions to map their state of mind, abilities, reality, problems, and the flow of events.

![Here are some notes on what we can take away from the NPS comments](/media/64notes/2019/design-framework/nps-comments-annotated.png)

At this point, we have fair amount of data, stories, and evidence for the next step:

Our old friend — mapping. Here are 3 example maps we could draw:

1.  Customer who bought the ticket over ~24 hours before the experience
2.  Customer who purchased the ticket within less than ~24 hours before the experience
3.  Customer who purchased a combo which may generate a single, two or more tickets ( this leads us back to #1 & #2 as sub-journey maps)

Let's see what usecases emerge, as we try to map our customers' journey:

![Example User Journey Map: Rue buys tickets 48 hours before the experience.](/media/64notes/2019/design-framework/user-journey-map-ticket-lead-time-gt-24-hours-example.png)

Example User Journey Map: This helps us find, study, and manage usecase.

As we draw our timelines, we get a better view of what happened before & after the problem(s), and how these events relate to each other.

Designing for the happy path may seem like an obvious step, but what happens on the unhappy paths are constraints for the happy path.

E.g; Customer reaches the meeting point and realizes they had to print the ticket — there's nothing they can do now. We can proactively solve this issue by marking the tickets, emails, and remind our customers to print the ticket well-in time.

![Example User Journey Map: How mapping a timeline can help us anticipate and solve problems.](/media/64notes/2019/design-framework/example-user-journey-map-annotated.png)

This exercise gives us:

1.  **Usecases:** that we'll design for, including the problem statements we started with. We use the information/variables and their various states & representations to solve these problems
2.  **User Concerns:** that allow us to make "groups" of these usecases, which, further, allows us to:
    
    *   Control & document side-effects (shared use-cases and/or information)
    *   Allow us to prevent the problem; rather than "fixing" it with reactive support
    *   Priortize which user-concerns should we iterate, test, or deliver first (based on frequency, cost, urgency, etc.)

Let's pick one concern from our map above — _"Where do I need to go?"_ — to illustrate:

![An example mapping user concerns which contain use cases, which contain variables, which have states.](/media/64notes/2019/design-framework/mapping-concerns-usecases-variables-states.png)

The First part of our Ticket Design Framework is the definition of the problem landscape.

Now, we can ask useful questions to our teams (data, tech, category, support), like:

1.  How often does this happen?
2.  How many tickets do we generate every day with these vs these iterations?
3.  What's the typical count of people per booking?

Or to our customers (not verbatim):

1.  What happened after you got your tickets?
2.  How did you make sure you're at the right spot?

This helps us prioritise and tame the scope of work.

Now we start to study how these variables relate to each other, and we can make guidelines around how to best design for them.

Let's take the example of these variables & the states they may exist in:

![An example of grouping & turning variables into structured data.](/media/64notes/2019/design-framework/variable-state-examples.png)

Let's say we have to add another variable to this structure:

![An example of adding a new variable to the structured data.](/media/64notes/2019/design-framework/adding-new-variable-to-structured-data.png)

Well that was easy! Also, at this point we can check for all side-effects.

Let's go one step further — what's the best way to communicate _Validity_?

![We can dive deeper to understand what's the best way to communicate validity.](/media/64notes/2019/design-framework/options-for-formatting-validity-data.png)

Writing the full date is the best way to communicate validity (for print). We can explore options, document the final decision and the reason for that decision.

Not only the were we able to understand the problem, the solution (communicate information), and architect the information, but this also allowed us to think harder about the small details.

This makes iterations more meaningful, and you can quickly check them against your problem statements.

* * *

### Iterating for Solutions

Remember our meeting point problem? This is the new version:

![This is how we improved our meeting point.](/media/64notes/2019/design-framework/meeting-point-print-ticket-example.jpg)

Some improvements include:

*   Meeting point with landmarks (A & B) in picture and map format
*   "Reach Here" is clearer than "Location"
*   A link to Google Maps on the mobile & email version, and a scannable QR code to open the link in Maps on the print version.
*   Clear instructions on whom/what to find when you reach the meeting point; we often try to include photos of the guide
*   Landmarks described in easy to show/say words to help customers locate the meeting point; should they feel lost

Our guides were hard to spot — another problem highlighted by the NPS comments. So we designed T-shirts for our guides:

![Headout Guide's wearing the new easy to spot Tshirts.](/media/64notes/2019/design-framework/headout-guide-tshirt-design.jpg)

Our brand colour is easy to spot in Europe; where most people wear neutral colours. Name of the City & word "Headout" are visible in front, the word "Guide" at the back (which doubles up as a discount code).

Here's what the final tickets look like:

**Example Print Tickets:**

![Photo of Sample Headout Print Tickets.](/media/64notes/2019/design-framework/headout-print-ticket-photos.jpg)

Sample print tickets (we are still optimizing map colours for B&W print).

**Mobile Ticket Prototype:**

<iframe src="https://player.vimeo.com/video/369376167" width="300" height="700" frameborder="0" allow="autoplay; fullscreen" allowfullscreen=""></iframe>

* * *

### Why use Design Frameworks?

1.  Document problems & nuances
    
2.  Understand, tame & prioritise the vast scope
    
3.  Separate the problem from the solution: We can keep trying different solutions & ideas, without losing sight of the problems. We can test & measure our iterations against these problem statements & use cases.
    
    This also helps inform Product KPI's and Non-Functional Requirements (for ya'll PM's out there).
    
4.  Document & understand feedback: Did we get the problem wrong or the solution doesn't work? Or some other solution is better because of x?
    
5.  Help us solve better, by allowing us to isolate the relevant parts and dig deeper
    

Here's (almost) the entire process visualised:

<iframe src="https://player.vimeo.com/video/369376066" width="640" height="480" frameborder="0" allow="autoplay; fullscreen" allowfullscreen=""></iframe>

Do you see the value of using Design Frameworks at your organisation? Does your Design System document problems? What are the parts you find useful or unusable?

Let me know [on twitter](https://www.twitter.com/kingsidharth).

**PS:** This article is a result of the [conversation on twitter](https://twitter.com/kingsidharth/status/1175348098584858624), followed by a video:

<iframe width="100%" style="height: 320px; min-height: 250px;" src="https://www.youtube.com/embed/KHKkF8efyMo" frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen=""></iframe>
