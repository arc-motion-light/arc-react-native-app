/**
 ******************************************************************************
 * @file    STMeshHealthModel.h
 * @author  ST BLE Mesh Team
 * @version V1.03.000
 * @date    18-June-2018
 * @brief   Implementation of Health model.
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

@protocol STMeshHealthModelDelegate;
@interface STMeshHealthModel : NSObject
/*!
 * @brief HealthModelGetFaults: To get the faults occured on the node : Parameters Required are peerAddress and Company Identifier.
 * @discussion Faults generated on node will enquire by Health Model Get Faults
 * @param1 peerAddress Node Address of the network
 * @param2 cid The Health Fault state is identified by Company ID and may be present in the node for more than one Company ID.
 * @return  Result of the method execution.
 */
-(STMeshStatus)HealthModelGetFaults:(uint16_t)peerAddress companyIdentifier:(uint16_t)cid;


/*!
 * @brief HealthFaultClear: To clear the faults occured on the node : Parameters Required are peerAddress, Company Identifier and isUnacknowledged.
 * @discussion The response to a Health Fault Clear message is a Health Fault Status message.
 * @param1 peerAddress Node Address of the network
 * @param2 cid The Health Fault state is identified by Company ID and may be present in the node for more than one Company ID.
 * @param3 isUnacknowledged Bool to send the reliable command.
 * @return  Result of the method execution.
 */
-(STMeshStatus)HealthFaultClear:(uint16_t) peerAddress companyIdentifier:(uint16_t) cid isUnacknowledgedCommand:(bool) isUnacknowledged;


/*!
 * @brief The Health Period Get is an acknowledged message used to get the current Health Period state of an element
 * @discussion The response to a Health Period Get message is a Health Period Status message.
 * @param peerAddress Address of the node recieving the command.
 * @return  Result of the method execution.
 */
-(STMeshStatus)HealthPeriodGet:(uint16_t) peerAddress;

/*!
 * @brief The Health Period Set is an Unacknowledged message used to set the current Health Period state of an element
 * @param1 peerAddress Address of the node recieving the command.
 * @param2 fastPeriodDivisor Divider for the Publish Period. Modified Publish Period is used for sending Current Health Status messages when there are active faults to communicate
 * @param3 isUnacknowledged Bool to send the reliable command.
 * @return  Result of the method execution.
 */
-(STMeshStatus)HealthPeriodSet:(uint16_t) peerAddress fastPeriodDivisor:(uint8_t )fastPeriodDivisor  isUnacknowledgedCommand:(bool) isUnacknowledged;

/*!
 * @brief The Health Period Set is an acknowledged message used to set the current Health Period state of an element
 * @discussion The response to a Health Period Set message is a Health Period Status message.
 * @param1 peerAddress Address of the node recieving the command.
 * @param2 fastPeriodDivisor Divider for the Publish Period. Modified Publish Period is used for sending Current Health Status messages when there are active faults to communicate
 * @return  Result of the method execution.
 */
-(STMeshStatus)HealthPeriodSet:(uint16_t) peerAddress fastPeriodDivisor:(uint8_t )fastPeriodDivisor;

/*!
 * @brief The Health Attention Get is an acknowledged message used to get the current Attention Timer state of an element
 * @param peerAddress Address of the node recieving the command.
 * @return  Result of the method execution.
 */
-(STMeshStatus)HealthAttentionGet:(uint16_t) peerAddress;

/*!
 * @brief The Health Attention Set Unacknowledged is an unacknowledged message used to set the Attention Timer state of an element
 * @param1 peerAddress Address of the node recieving the command.
 * @param2 attention The Attention field shall identify the new Attention Timer state of an element
 * @return  Result of the method execution.
 */
-(STMeshStatus)HealthAttentionSet:(uint16_t) peerAddress attention:(uint8_t )attention  isUnacknowledgedCommand:(bool) isUnacknowledged;


/*!
 * @brief The Health Attention Set is an acknowledged message used to set the Attention Timer state of an element
 * @discussion The response to a Health Attention Set message is a Health Attention Status message.
 * @param1 peerAddress Address of the node recieving the command.
 * @param2 attention The Attention field shall identify the new Attention Timer state of an element
 * @return  Result of the method execution.
 */
-(STMeshStatus)HealthAttentionSet:(uint16_t) peerAddress attention:(uint8_t )attention;

@property(weak , nonatomic) id<STMeshHealthModelDelegate> delegate;
@end
@protocol STMeshHealthModelDelegate <NSObject>
/* This callback is called when register fault status is received from the  node. */




/*!
 * @brief The Health Fault Status is an unacknowledged message used to report the current Registered Fault state of an element.
 * @discussion The message may contain several Fault fields, depending on the number of concurrently present fault conditions. If no Fault fields are present, it means no registered fault condition exists on an element.
 * @param1 peerAddress Address of the node.
 * @param2 testID Identifier of a specific test to be performed.
 * @param3 companyID 16-bit Bluetooth assigned Company Identifier.
 * @param4 faultsArray Faults occured on the node is reflecting in this array.
 */
- (void)healthModel:(STMeshHealthModel *)healthModel didReceiveHealthStatusFromAddress:(uint16_t)peerAddress testID:(uint8_t)testID companyID:(uint8_t)companyID withPresentsFaults:(NSArray*)faultsArray;

/*!
 * @brief The Health Period Status is an unacknowledged message used to report the Health Period state of an element .
 * @param1 peerAddress Address of the node.
 * @param2 fastPeriodDivisor Divider for the Publish Period. Modified Publish Period is used for sending Current Health Status messages when there are active faults to communicate
 */
-(void) healthModel:(STMeshHealthModel *)healthModel didReceiveHealthPeriodStatusResponseFromAddress:(uint16_t)peerAddress WithFastPeriodDivisor:(uint8_t)fastPeriodDivisor;
/*!
 * @brief The Health Attention Status is an unacknowledged message used to report the current Attention Timer state of an element.
 * @param1 peerAddress Address of the node.
 * @param2 attention Value of the Attention Timer state
 */
-(void) healthModel:(STMeshHealthModel *)healthModel didReceiveHealthAttentionStatusResponseFromAddress:(uint16_t)peerAddress WithAttention:(uint8_t)attention;
@end
