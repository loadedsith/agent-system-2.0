# **Main Objective**

We are creating a system to manage the work I must do while working on both Newdle projects as well as personal projects. I believe the main requirement will be an orchestrator agent, but I am willing to be proven wrong.

# LOW LEVEL Requirements:

* **EVERYTHING MUST work with OMP**  
* **NOTHING IS SACRED. If a process or machinery we have does not serve the goal**   
* **I am FINE with uninstalling the newdle-claude-plugin. In fact assume that at the end of this I will. My team members do not need my machinery**  
* **(SOFT REQUIREMENT) if the machinery can be backed up in a github repo owned by thewolff (not thewolff-engineer) that would be ideal. It doesn’t have to include any named seats that we agree upon. But in theory I should be able to install the basis of this machinery on a completely new workspace/machine and have it function similar to be expected**  
* **All actual work done by the machinery is to be handled as specific slices**

# Things About the Current System that I like

* CTX for extended memory (though I’m not married to it as a solution)  
* Having one main agent that I can communicate through  
* A seat who’s sole job is the to improve the main machinery  
* Decision logs /session hand offs on /wrap-up  
* Session hand offs before autocompaction (to be read right after compaction is finished)  
* The output-types \- all agents must obey these when communicating, hooks can enforce them (and do currently)  
* Set of skills to do code review, a11y review, and etc  
* Use of worktrees for parallalization

# Things that I’m Unsure of

* Multiple persistent named seats. Is this an advantage or is it just creating extra hops?   
* If multiple persistent named seats are better off being divided per repository, or if they should be built around capabilities (a frontend named seat, a database named seat)

# Things that I dislike

* Lintel, my current orchestrator is so chatty. I want to feel like I can just give it a task and then it gets handled, not that I have to show up for every little fire  
* I want to be involved in the spec’ing and briefing of larger tickets/projects \- right now a marche just does it for me. This is fine for small bugfixes, but for new features I should be directly involved in the loop  
* 

# Misc/Suggestions

* Currently there are SO many skills. I don’t want to provide 50+ skills this time  
* I am thinking maybe [https://github.com/addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) for when I want to actually steer and do things myself, and [https://github.com/obra/superpowers](https://github.com/obra/superpowers) for autonomous running. I want these agents to be able to both work in autonomous mode and user driven mode.a