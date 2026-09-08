---
title: "(Re)Design for Business Products: Instamojo Rebranding Case Study"
description: Redesigning & rebranding products that people use every day
pubDate: 2018-12-17
tags: []
---

<!-- Imported by scripts/import-64notes.ts -->

In August this year (2018), [we launched Instamojo’s new brand (along with a new line of products)](https://www.instamojo.com/blog/our-big-reveal-introducing-the-new-instamojo/) . As a part of the rebranding, we redesigned our products across the web and mobile platforms.

There were many questions to answer, like:

*   How much should the design, interface, and experience change?
*   How will it affect the business and experience of our existing customers? How much time will they spend retraining their staff?
*   How long will it take to conceptualise, iterate, test, and deliver? How much time do we have?
*   How many people would we need?

We had 45 days to get everything done.

## When do we need a redesign?

Let’s talk about when a redesign is unavoidable.

**First**—if the business or product is pivoting. A fundamental shift in the nature of problems or target user mandates a redesign.

**Second**—when the design problems are costing the customer or the business. In most cases, both happen together and do damage before they get noticed.

The best approach, in both scenarios, is to start from scratch — the user. Anything else would increase the cost further.

**Third**—is rebranding—a shift in tone and identity of the business. It could be a complete overhaul including a name change. Or a refinement of the original brand.

In the first case, when the brand is changing completely, it may require the design team to delve deeper and rethink all the mental models from scratch. As a result, everything could change—the structure, language, tone, interface, visuals, etc. The scope for such a redesign exercise depends on why the redesign was done in the first place.

But in the second case, when you’re refining a brand that already works, an iterative evolution of design is a better approach. This helps preserve the nuances and learnings from past.

Here, “[realign](https://alistapart.com/article/redesignrealign)” is a better term than “redesign”.

That was the case with Instamojo. We were building on top of our existing brand. We were amplifying what worked, our “Design for India” approach, and realigning our messaging to what mattered most to our customers.

## How deep did we need to go to redesign?

Our customers’ needs were the most important. Instamojo is used by lakhs of businesses who have a staff of 100s and 1000s —  all of whom have learned Instamojo workflows and depend on them every day to get their job done. If we changed one button, several businesses would stop functioning.

This is why you don’t see a radical redesign in products built for work or enterprise. Even if they do go through a major redesign, they are always versioned to prevent the shock of switching costs.

You can redesign, for example, Twitter without such concerns. Sure, your users and marketing departments might hate you for a bit. But no one’s life would change dramatically. (WhatsApp is the opposite).

Bad redesigns can even kill a vitamin app, especially when users hate it. It’s most likely because you were thinking of your needs more than your users’.

* * *

We were redesigning Instamojo in two phases:

1.  **Rebranding:** To be launched with mojoCon and our new brand (this was to be done within 45 days)
2.  **Long-term redesign for scale:** Iterative improvements in the product, design, and experience to make the product more scalable

## Rebranding

Rebranding the public facing Instamojo properties was the first priority. While the marketing and the communications design teams started working on the language, tone and messaging of Instamojo, the product design team was iterating to realigning our design system to the new brand aesthetics.

While our design system, grown over the past 4 years, deserves a full post; our component library was changing the most. It has several layers:

1.  **Brand** — basic brand identity and usually the first order derivatives (UI colours, type scales, etc.)
2.  **Base (Elements)** — Divs, type usage, shapes, the basic indivisible visual units of the interface
3.  **Objects** — Units which are made up of several elements. Eg: Buttons, Fields, Cards, Tables, etc.
4.  **Components** — Reusable interface models that have a lifecycle and several states. Eg: Cards, Menus / Navigations, Tabs, etc.
5.  **Templates & Flows** — a full structure/layout that is made up of several components

![Instamojo Component Library, a part of our Design System.](/media/64notes/2018/1/instamojo-design-system-component-library.png)

The older version of the component library a part of the design system we use at Instamojo

We have another component library for our public facing landing pages that was rebranded in parallel. Design systems not only help us improve the quality but also deliver faster.

A living design system helps you:

1.  Estimate & prioritise the work and scope
2.  Covers the risk of missing something critical
3.  Preserve knowledge

In fact, every progressive iteration gives you a chance to fix past mistakes.

For example, this was our earlier colour palette:

![Instamojo Component Library, a part of our Design System.](/media/64notes/2018/1/instamojo-brand-colour-palatte-2017.png)

Instamojo’s old brand colour palette till July 2018

And this is our new palette:

![New Brand colours of Instamojo.](/media/64notes/2018/1/instamojo-brand-colours-2018.png)

The new Instamojo brand colour palette launched in August 2018

And here is the palette we derived from our brand colours:

![Colours derived from brand colours to be used as a part of UI.](/media/64notes/2018/1/instamojo-ui-colours-derived-palatte.png)

UI Colour Palette derived from the brand colour palette

As discussed earlier, our primary concern was minimising re-learning for our existing customers. What is it that our users hard learned? What would they need to relearn?

### Procedural Memory

Our learning, especially the user-interface learning, heavily relies on muscle-memory (a type of procedural memory). This is the same sort of memory we rely on to accomplish things like touch typing, cycling, etc.

There are two relevant parts for our discussion on understanding memory and learning:

1.  **Spatial Memory:** Simply put, spatial memory helps you recall where things are. This is also how you remember what switch is for what purpose in your house. (Read More)
2.  **Visual Memory:** How things look — relative contrast, size, shape, etc. This is how we learn to read the script of a language and get better at it.

Since we were not changing the basic structure and architecture of the products, that took care of the spatial memory.

For visual memory, we focused on the relative contrast of visual components. Either retaining or improving their relative contrast.

**For example**, our buttons for positive, negative, and neutral actions had different contrasts. We improved the relative contrast between the buttons while translating them into our new design system.

![We improved the relative contrast of our button during the redesign.](/media/64notes/2018/1/instamojo-ui-buttons-contrast-improvement.png)

We improved the relative contrast and visual hierarchy for the buttons in our component library.

Moving up the layers, executing and testing all along the way, we accomplished the redesign in 45 days 🔥

![Instamojo Android app, before and after the redesign.](/media/64notes/2018/1/instamojo-android-app-before-and-after-redesign.png)

Some sample screens from our Android product

![Instamojo Desktop web product, before and after the redesign.](/media/64notes/2018/1/instamojo-web-product-before-and-after-redesign.png)

Sample screens from our desktop web product

We were a team of 5 including–3 designers (Animesh, [Mj](https://medium.com/@creativemj), and [Sreenath Kotteri](https://medium.com/@sreenathkotteri)), 1 engineer ( [Priya Choudhary](https://medium.com/@priyac1411)) and, I. Plus we received all the support we could ask for from the mojo family.

![    Press coverage of mojoCon 2018, where we launched our new brand and new products.](/media/64notes/2018/1/instamojo-mojocon-2018-press-coverage.jpeg)

Press coverage of mojoCon 2018, where we launched our new brand and new products. [(Source)](https://www.india.com/business/instamojo-expands-its-product-portfolio-launches-mojoxpress-mojocapital-3264199/)  
_Read more [here](https://retail.economictimes.indiatimes.com/news/industry/instamojo-launches-mojocapital-mojoxpress-in-jaipur/66751325) and [here](https://www.livemint.com/Companies/W0L5o2YKBMbf9XxWZEnStM/Instamojo-targets-1-billion-in-transactions-by-2019.html) ._

## Long-term redesign for scale

While designing is a constant exercise, there is design debt to be paid. Simple law of numbers — when the user-base increases rare use-cases become common. The design starts to feel stale and I don’t mean “it’s so 90s” stale. I mean “it’s too painful!” stale.

We took this opportunity to repay some of the design debt. We are redesigning the business-critical parts of the product in reverse order of usage. This ensures the least relearning for the user. It also gives us buffer to make mistakes as we move towards redesigning heavily used products and features.

We combine these releases with major product updates or new product/feature launch. The excitement and curiosity of a new product/feature can help with user inertia.

### “How do I delete this?”

On Instamojo, a merchant can create a Payment Link they can share with their customers to accept payments. There’s a dashboard where the user can manage all their links. Untill earlier this year, we did not allow the users to delete their links. You could switch it off & on. But you couldn’t delete it.

While there were a lot of reasons for making this design decision, the most important ones were:

1.  We couldn’t delete records of something that was sold; it’s hard to refer to them, etc.
2.  A typical user wouldn’t have more than 100 links (that was true up until a year ago)

The second reason vanished as we grew multifold. Users had thousands of links. “How do I delete this” for some got so out of hand that they had to create multiple accounts with us just to escape their links 😞. This is a typical example of design debt and if not fixed in time can cost the business a lot.

We fixed this and several other problems during this redesign. We discovered critical problems by talking to the users (something [Mohamed Ansari](https://medium.com/@mohamed.ansari) does the best) and going through months of support tickets.

Today, all payment links are deletable and editable. Something we wouldn’t be able to pull off if not for the resources and scale.

![After the redesign, we gave our users ability to delete the links using Dashboard.](/media/64notes/2018/1/instamojo-payment-links-dashboard-screenshot.png)

Our users can now finally delete thousands of redundant links!

But the dashboard screenshot doesn’t begin to tell the story of the relief our users felt. Here’s how our users reacted by deleting payment links after we launched the feature:

![1000s of links were deleted by users within days of the launch.](/media/64notes/2018/1/instamojo-delete-payment-links-event-chart.png)

Deleted Payment Links event spiked after the launch of the feature

Now that’s a redesign users love.

We’ll continue to realign the product & design to our customers’ need. For us, redesigning is a continuous process, something we do every day.

These awesome people helped me edit and tame this post: [Mj](https://medium.com/@creativemj), [Ruchita Lodha](https://medium.com/@ruchitalodha), [Harshad Sharma](https://medium.com/@hiway), and [Rapti](https://medium.com/@Rapti).

[See original post on medium.](https://medium.com/@kingsidharth/re-design-for-business-products-instamojo-rebranding-case-study-f51663533dd)
