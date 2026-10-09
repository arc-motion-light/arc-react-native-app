/**
 ******************************************************************************
 * @file    STMeshTimeAndSceneModel.h
 * @author  ST BLE Mesh Team
 * @version V1.03.000
 * @date    18-June-2018
 * @brief   Implementation of TimeAndScene model.
 ******************************************************************************
 * @attention
 *
 * <h2><center>&copy; COPYRIGHT(c) 2019 STMicroelectronics</center></h2>
 *
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 *   1. Redistributions of source code must retain the above copyright notice,
 *      this list of conditions and the following disclaimer.
 *   2. Redistributions in binary form must reproduce the above copyright notice,
 *      this list of conditions and the following disclaimer in the documentation
 *      and/or other materials provided with the distribution.
 *   3. Neither the name of STMicroelectronics nor the names of its contributors
 *      may be used to endorse or promote products derived from this software
 *      without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 ******************************************************************************
 */

#import <Foundation/Foundation.h>
#import "STMeshBasicTypes.h"

@protocol STMeshTimeAndSceneModelDelegate;
@interface STMeshTimeAndSceneModel : NSObject




/* Scene Messages */
/**
 * @brief  Store Scene for the element with specific Scene Number.
 * @discussion Scene Store is an acknowledged message used to store the current state of an element as a Scene, which can be recalled later.
 * @param1  peerAddress Element address from which the scene number is maintained.
 * @param2  sceneNumber unique number to store as scene number and using the same scene number we can recall it later.
 * @return Result of the method execution.
 */
- (STMeshStatus)timeAndSceneStoreScene:(uint16_t)peerAddress
                            sceneNumber:(uint16_t)sceneNumber;


/**
 * @brief  Non reliable message to Store Scene for the element with specific Scene Number.
 * @discussion Scene Store is an unacknowledged message used to store the current state of an element as a Scene, which can be recalled later. You will get the status of this message in the scene register status
 * @param1  peerAddress Element address from which the scene number is maintained.
 * @param2  sceneNumber unique number to store as scene number and using the same scene number we can recall it later.
 * @return Result of the method execution.
 */
- (STMeshStatus)timeAndSceneStoreSceneUnacknowledged:(uint16_t)peerAddress
                                           sceneNumber:(uint16_t)sceneNumber;

/**
 * @brief  Scene recall is a message to recall the scene for the specific element using scene number.
 * @discussion Scene Recall is an acknowledged message that is used to recall the current state of an element from a previously stored scene.
 * @param1  peerAddress Element address from which the scene number is maintained.
 * @param2  sceneNumber unique number to store as scene number and using the same scene number we can recall it later.
 * @param3  transitionTime Optional, the Transition Time field identifies the time that an element will take to transition from the present states to the target states defined by the recalled Scene.
 * @param4 delay Optional, the Delay field identifies the message execution delay, which represents a time interval between receiving the message by a model and executing the associated model behaviors

 * @return Result of the method execution.
 */
- (STMeshStatus)timeAndSceneSceneRecall:(uint16_t)peerAddress
                              sceneNumber:(uint16_t)sceneNumber
                           transitionTime:(uint8_t)transitionTime
                                    delay:(uint8_t)delay;
/**
 * @brief  Scene recall unacknowledge is a message to recall the scene for the specific element using scene number.
 * @discussion Scene Recall is an acknowledged message that is used to recall the current state of an element from a previously stored scene. You will get the status of this message in the scene status message.
 * @param1  peerAddress Element address from which the scene number is maintained.
 * @param2  sceneNumber unique number to store as scene number and using the same scene number we can recall it later.
 * @param3  transitionTime Optional, the Transition Time field identifies the time that an element will take to transition from the present states to the target states defined by the recalled Scene.
 * @param4 delay Optional, the Delay field identifies the message execution delay, which represents a time interval between receiving the message by a model and executing the associated model behaviors

 * @return Result of the method execution.
 */
- (STMeshStatus)timeAndSceneSceneRecallUnacknowledged:(uint16_t)peerAddress
                                          sceneNumber:(uint16_t)sceneNumber
                                       transitionTime:(uint8_t)transitionTime
                                                delay:(uint8_t)delay;

/**
 * @brief  Scene Get is an acknowledged message used to get the current status of a currently active scene of an element.
 * @discussion Scene Get is an acknowledged message used to get the current status of a currently active scene of an element. If you have not called any scene store and recall message it will give you value 0. You will get the status of this message in the scene status message.
 * @param1  peerAddress Element address of the currently active scene.
 * @return Result of the method execution.
 */

- (STMeshStatus)timeAndSceneSceneGet:(uint16_t)peerAddress;



/**
 * @brief  Scene Register Get is an acknowledged message used to get the current status of the Scene Register of an element.
 * @discussion cene Register Get is an acknowledged message used to get the current status of the Scene Register of an element. It will give you the array of scene numbers associated for requested element address. You will get the status of this message in the scene register status
 * @param1  peerAddress Element address of the currently active scene.
 * @return Result of the method execution.
 */
- (STMeshStatus)timeAndSceneSceneRegisterGet:(uint16_t)peerAddress;


/**
 * @brief  Scene Delete is an acknowledged message used to delete a Scene from the Scene Register state.
 * @discussion Scene Delete is an acknowledged message used to delete a Scene from the Scene Register state. You will get the status of this message in the scene register status
 * @param1  peerAddress Element address from which the scene number is maintained.
 * @param2  sceneNumber unique number which you used at the time of storing the scene in the scene register.
 * @return Result of the method execution.
 */
- (STMeshStatus)timeAndSceneStoreDelete:(uint16_t)peerAddress
                             sceneNumber:(uint16_t)sceneNumber;


/**
 * @brief  Scene Delete Unacknowledged is an unacknowledged message used to delete a Scene from the Scene Register state.
 * @discussion Scene Delete Unacknowledged is an unacknowledged message used to delete a Scene from the Scene Register state.
 * @param1  peerAddress Element address from which the scene number is maintained.
 * @param2  sceneNumber unique number which you used at the time of storing the scene in the scene register.
 * @return Result of the method execution.
 */
- (STMeshStatus)timeAndSceneStoreDeleteUnacknowledged:(uint16_t)peerAddress
                                           sceneNumber:(uint16_t)sceneNumber;





@property(weak , nonatomic) id<STMeshTimeAndSceneModelDelegate> delegate;

@end
@protocol STMeshTimeAndSceneModelDelegate <NSObject>


/**
 * @brief  Scene Delete Unacknowledged is an unacknowledged message used to delete a Scene from the Scene Register state.
 * @discussion Scene Delete Unacknowledged is an unacknowledged message used to delete a Scene from the Scene Register state.
 * @param1  peerAddress Element address from which the scene number is maintained.
 * @param2  statusCode The Status Code field identifies the status code for the last operation. The allowed values for status codes and their meanings are documented as 0x00 Success,  0x01 Scene Register Full , 0x02 Scene Not Found and 0x03–0xFF Reserved for Future Use.
 * @param3  currentScene The Current Scene field identifies the Scene Number of the current Scene. If no scene is active, the Current Scene field value is 0.
 * @param4  targetScene  Optional Field, When an element is in the process of changing the Scene state, the Target Scene field identifies the target Scene Number of the target Scene state the element is to reach.
 * @param5  remainingTime  If present, the Remaining Time field indicates the time it will take the element to complete the transition to the target Scene state of the element..
 */
-(void)timeAndSceneModel:(STMeshTimeAndSceneModel *)timeAndSceneModel didReceiveSceneStatusFromAddress:(uint16_t)peerAddress WithStatusCode:(uint8_t)statusCode CurrentScene:(uint16_t)currentScene TargetScene:(uint16_t)targetScene remainingTime:(uint8_t)remainingTime;


/**
 * @brief  Scene Delete Unacknowledged is an unacknowledged message used to delete a Scene from the Scene Register state.
 * @discussion Scene Delete Unacknowledged is an unacknowledged message used to delete a Scene from the Scene Register state.
 * @param1  peerAddress Element address from which the scene number is maintained.
 * @param2  statusCode The Status Code field identifies the status code for the last operation. The allowed values for status codes and their meanings are documented as 0x00 Success,  0x01 Scene Register Full , 0x02 Scene Not Found and 0x03–0xFF Reserved for Future Use.
 * @param3  currentScene The Current Scene field identifies the Scene Number of the current Scene. If no scene is active, the Current Scene field value is 0.
 * @param4  scenes  A list of scenes stored within an element
 * @param5  numberOfScenes Please note! It is not as per the document just to send the count of the array of scenes stored within an element

 */
-(void)timeAndSceneModel:(STMeshTimeAndSceneModel *)timeAndSceneModel didReceiveRegisterStatusFromAddress:(uint16_t)peerAddress WithStatusCode:(uint8_t)statusCode CurrentScene:(uint16_t)currentScene scenes:(NSMutableArray*)scenes numberOfScenes:(uint16_t)numberOfScenes;

@end

